const { Pool } = require('pg');
const express = require('express')
const bodyParser = require('body-parser');

const PORT = process.env.PORT || 5000

const pool = new Pool({
	host: 'localhost',
	user: 'postgres',
	database: 'qm',
	password: 'e',
});

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

express()
  .use(bodyParser.json())
  .use((req, res, next) => {
    res.header(
      'Access-Control-Allow-Origin',
      'http://localhost:3000'
    );
    res.header(
      'Access-Control-Allow-Headers',
      'Origin, X-Requested-With, Content-Type, Accept'
    );
    res.header('Access-Control-Allow-Methods', 'PUT, POST, GET, DELETE')
    next();
  })
	.post('/pengantri', (req, res) => {
    if (isBodyValid(req, ['namawakil', 'jumlah'])) {
      pool.connect().then((client) => {
        return client.query("INSERT INTO pengantri (namawakil, jumlah, waktumulai) SELECT $1, $2, (current_time at time zone 'cxt')::TIME(0);", [req.body.namawakil, req.body.jumlah])
          .then(() => {
            client.release();
            res.status(200).send('Pengantri berhasil ditambahkan');
          }).catch((err) => {
            client.release();
            console.log(err.stack);
            res.status(500).send('Pengantri gagal ditambahkan');
          })
      })
    } else {
      res.status(400).send("Request body tidak lengkap");
    }
	})
  .get('/pengantri', (req, res) => {
    pool.connect().then((client) => {
        return client.query('SELECT * FROM pengantri')
          .then((result) => {
            client.release();
            res.json(result.rows);
          })
          .catch(err => {
            client.release();
            console.log(err.stack);
            res.status(500).send('Data pengantri gagal diperoleh');
          })
      })
	})
  .delete('/pengantri', (req, res) => {
    if (isQueryStringValid(req, ['id'])) {
      pool.connect().then((client) => {
        return client.query('DELETE FROM pengantri WHERE id=$1;', [req.query.id]).then(() => {
          client.query('SELECT COUNT(*) FROM pengantri;').then((rescount) => {
            if (rescount.rows[0].count === '0') {
              client.query('ALTER SEQUENCE pengantri_id_seq RESTART WITH 1;').then(() => {
                client.release();
                res.status(200).send(`Pengantri ${req.query.id} berhasil dihapus`);
              }).catch(err => {
                throw err;
              });
            } else {
              client.release();
              res.status(200).send(`Pengantri ${req.query.id} berhasil dihapus`);
            }
          }).catch(err => {
            throw err;
          });
        }).catch(err => {
          client.release();
          console.log(err.stack);
          res.status(500).send(`Pengantri ${req.query.id} gagal dihapus`);
        })
      })
    } else {
      res.status(400).send("Request body tidak lengkap");
    }
  })
	.get('/meja', (req, res) => {
    pool.connect().then((client) => {
      return client.query('SELECT * FROM meja')
        .then((result) => {
          client.release();
          res.json(result.rows);
        }).catch((err) => {
          client.release();
          console.log(err.stack);
          res.status(500).send('Data meja gagal diperoleh');
        })
    })
	})
  .put('/meja', (req, res) => {
    if (isBodyValid(req, ['status', 'meja'])) {
      let query = `UPDATE meja SET status = ${req.body.status} WHERE `;
      if (req.body.meja.length === 0) {
        res.status(200).send('Tidak ada meja yang statusnya diubah');
      } else {
        query += `(id = ${req.body.meja[0].id} AND kapasitas = ${req.body.meja[0].kapasitas})`
        for (let i=1; i<=req.body.meja.length-1; i++) {
          query += ` OR (id = ${req.body.meja[i].id} AND kapasitas = ${req.body.meja[i].kapasitas})`
        }
      }
      pool.connect().then((client) => {
        return client.query(query)
          .then(() => {
            client.release();
            res.status(200).send(`Status meja berhasil diganti`);
          }).catch((err) => {
            client.release()
            console.log(err.stack);
            res.status(500).send('Status meja gagal diganti');
          })
      })
    } else {
      res.status(400).send("Request body tidak lengkap");
    }
  })
	.listen(PORT, () => console.log(`Listening on ${PORT}`));