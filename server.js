const Axios = require('axios');
const { Pool } = require('pg');
const express = require('express')
const bodyParser = require('body-parser');
const { google } = require('googleapis');
require('dotenv').config();

const PORT = process.env.PORT || 5000

let config;
if (process.env.DATABASE_URL) {
  config = {
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  };
} else {
  config = {
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASS,
    database: process.env.DB_NAME
  };
}
const pool = new Pool(config);

function isQueryStringValid(req, requiredAttribute) {
  let valid;
  requiredAttribute.every((val) => {
    valid = ((req.query[val] !== undefined) && (req.query[val] !== ''));
    return valid;
  });
  return valid;
}

function isBodyValid(req, requiredAttribute) {
  let valid;
  requiredAttribute.every((val) => {
    valid = ((req.body[val] !== undefined) && (req.body[val] !== ''));
    return valid;
  });
  return valid;
}

let clientId = process.env.CLIENT_ID;
let clientSecret = process.env.CLIENT_SECRET;
const oauth2Client = new google.auth.OAuth2(
  clientId,
  clientSecret,
  'http://localhost:3000',
);

function getGoogleAuthURL() {
  const scopes = [
    'https://www.googleapis.com/auth/userinfo.email'
  ];

  return oauth2Client.generateAuthUrl({
    prompt: 'consent',
    scope: scopes,
  });
}

async function getTokensFromCode(code) {
  try {
    const { tokens } = await oauth2Client.getToken(code);
    return tokens;
  } catch (err) {
    return null;
  }
};

function getGoogleUserInfo(access_token) {
  return Axios.get('https://www.googleapis.com/oauth2/v2/userinfo', {
    headers: {
      Authorization: `Bearer ${access_token}`,
    }
  });
};

express()
  .use(bodyParser.json())
  .use((req, res, next) => {
    res.header(
      'Access-Control-Allow-Origin',
      'http://localhost:3000'
    );
    res.header(
      'Access-Control-Allow-Headers',
      'Content-Type, Authorization'
    );
    res.header('Access-Control-Allow-Methods', 'PUT, POST, GET, DELETE, OPTIONS')

    if (req.method === 'OPTIONS') {
      return res.status(204).json('Opsi berhasil');
    }   

    next();
  })
  .use((req, res, next) => {
    if (req.path !== '/token' && req.path !== '/url' && req.path !== '/karyawan') {
      if (!req.headers.authorization || req.headers.authorization.indexOf('Bearer ') === -1) {
        res.status(401).json('Authorization header tidak ada');
      } else {
        let access_token = req.headers.authorization.split(' ')[1];

        pool.connect().then((client) => {
          return client.query('SELECT * FROM karyawan WHERE access_token = $1', [access_token]).then((result) => {
            if (result.rows.length === 0) {
              client.release();
              res.status(401).json('Authorization credential tidak valid');
            } else {
              if (Date.now() > new Date(result.rows[0].expiry)) {
                client.release();
                res.status(401).json('Token sudah expired');
              } else {
                client.release();
                req.userEmail = result.rows[0].email; 
                next();
              }
            }
          }).catch((err) => {
            client.release();
            // console.log(err);
            return res.status(500).json('Data token gagal diperoleh');
          })
        })
      }
    } else {
      next();
    }
  })
  .get('/peran', (req, res) => {
    pool.connect().then((client) => {
      return client.query('SELECT peran FROM karyawan WHERE email = $1', [req.userEmail]).then((result) => {
        client.release();
        res.status(200).json(result.rows[0].peran);
      }).catch((err) => {
        client.release();
        console.log(err.stack);
        res.status(500).json('Data peran karyawan gagal diperoleh');
      });
    });
  })
  .get('/url', (req, res) => {
    res.status(200).json(getGoogleAuthURL());
  })
  .post('/token', (req, res) => {
    getTokensFromCode(req.query.code).then((tokens) => {

      if (!tokens) {
        res.status(500).json('Gagal mendapatkan token');
      } else {
        getGoogleUserInfo(tokens.access_token).then((response) => {
          let query = `UPDATE karyawan SET access_token = $1, expiry = (to_timestamp($2* 1.0 /1000) AT TIME ZONE 'cxt') WHERE email = $3`;
          
          pool.connect().then((client) => {
            return client.query(query, [tokens.access_token, tokens.expiry_date, response.data.email]).then(() => {
              client.release();
              res.status(200).json(tokens.access_token);
            }).catch((err) => {
              client.release();
              console.log(err.stack);
              res.status(500).json('Access token gagal diperbarui');
            });
          });
        }).catch((err) => {
          console.log(err.stack);
          res.status(500).json('Gagal mendapatkan informasi google user');
        });
      }
    }).catch((err) => {
      console.log(err.stack);
      res.status(500).json('Gagal mendapatkan token');
    });
  })
  .post('/karyawan', (req, res) => {
    if (isBodyValid(req, ['email', 'peran'])) {
      pool.connect().then((client) => {
        let query = `INSERT INTO karyawan (email, peran) VALUES ($1, $2) ON CONFLICT (email) DO UPDATE SET peran = $2;`;

        return client.query(query, [req.body.email, req.body.peran]).then(() => {
          client.release();
          res.status(200).json('Karyawan berhasil ditambahkan');
        }).catch((err) => {
          client.release();
          console.log(err.stack);
          res.status(500).json('Karyawan gagal ditambahkan');
        });
      });
    } else {
      res.status(400).json('Request body tidak lengkap');
    }
  })
  .post('/pengantri', (req, res) => {
    if (isBodyValid(req, ['namawakil', 'jumlah'])) {
      pool.connect().then((client) => {
        let query = `INSERT INTO pengantri (namawakil, jumlah, waktumulai) VALUES ($1, $2, (current_time AT TIME ZONE 'cxt')::TIME(0))`;

        return client.query(query, [req.body.namawakil, req.body.jumlah]).then(() => {
          client.release();
          res.status(200).json('Pengantri berhasil ditambahkan');
        }).catch((err) => {
          client.release();
          console.log(err.stack);
          res.status(500).json('Pengantri gagal ditambahkan');
        });
      });
    } else {
      res.status(400).json('Request body tidak lengkap');
    }
  })
  .get('/pengantri', (req, res) => {
    pool.connect().then((client) => {
      return client.query('SELECT * FROM pengantri').then((result) => {
        client.release();
        res.status(200).json(result.rows);
      }).catch(err => {
        client.release();
        console.log(err.stack);
        res.status(500).json('Data pengantri gagal diperoleh');
      });
    });
  })
  .delete('/pengantri', (req, res) => {
    if (isQueryStringValid(req, ['id'])) {
      pool.connect().then((client) => {
        return client.query('DELETE FROM pengantri WHERE id=$1', [req.query.id]).then(() => {

          client.query('SELECT COUNT(*) FROM pengantri').then((rescount) => {
            if (rescount.rows[0].count === '0') {

              client.query('ALTER SEQUENCE pengantri_id_seq RESTART WITH 1').then(() => {
                client.release();
                res.status(200).json(`Pengantri ${req.query.id} berhasil dihapus`);
              }).catch(err => {
                client.release();
                console.log(err.stack);
                res.status(500).json('Sequence ID pengantri gagal direset');
              });

            } else {
              client.release();
              res.status(200).json(`Pengantri ${req.query.id} berhasil dihapus`);
            }
          }).catch(err => {
            client.release();
            console.log(err.stack);
            res.status(500).json('Data jumlah pengantri gagal diperoleh');
          });

        }).catch(err => {
          client.release();
          console.log(err.stack);
          res.status(500).json(`Pengantri ${req.query.id} gagal dihapus`);
        });
      });
    } else {
      res.status(400).json('Request body tidak lengkap');
    }
  })
  .get('/meja', (req, res) => {
    pool.connect().then((client) => {
      return client.query('SELECT * FROM meja').then((result) => {
        client.release();
        res.status(200).json(result.rows);
      }).catch((err) => {
        client.release();
        console.log(err.stack);
        res.status(500).json('Data meja gagal diperoleh');
      });
    });
  })
  .put('/meja', (req, res) => {
    if (isBodyValid(req, ['status', 'meja'])) {
      let query = `UPDATE meja SET status = ${req.body.status} WHERE `;

      if (req.body.meja.length === 0) {
        res.status(200).json('Tidak ada meja yang statusnya diubah');
      } else {
        query += `(id = ${req.body.meja[0].id} AND kapasitas = ${req.body.meja[0].kapasitas})`

        for (let i = 1; i <= req.body.meja.length - 1; i++) {
          query += ` OR (id = ${req.body.meja[i].id} AND kapasitas = ${req.body.meja[i].kapasitas})`
        }
      }

      pool.connect().then((client) => {
        return client.query(query).then(() => {
          client.release();
          res.status(200).json(`Status meja berhasil diganti`);
        }).catch((err) => {
          client.release()
          console.log(err.stack);
          res.status(500).json('Status meja gagal diganti');
        });
      });
    } else {
      res.status(400).json('Request body tidak lengkap');
    }
  })
  .listen(PORT, () => console.log(`Listening on ${PORT}`));