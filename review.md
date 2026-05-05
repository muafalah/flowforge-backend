# Code Review

## Kode Bermasalah

Kode ini dikirim melalui pull request untuk menjalankan sebuah workflow node:

```javascript
app.post('/api/execute-node', async (req, res) => {
  const { nodeId, script, variables } = req.body;
  
  // Update node status
  await db.query(`UPDATE nodes SET status = 'RUNNING' WHERE id = '${nodeId}'`);
  
  try {
    // Execute user provided script
    const result = eval(`
      (function() {
        const vars = ${JSON.stringify(variables)};
        ${script}
      })()
    `);
    
    // Save output
    await db.query(`UPDATE nodes SET status = 'SUCCESS', output = '${JSON.stringify(result)}' WHERE id = '${nodeId}'`);
    
    res.json({ success: true, result });
  } catch (err) {
    // Save error
    await db.query(`UPDATE nodes SET status = 'FAILED', error = '${err.message}' WHERE id = '${nodeId}'`);
    res.json({ success: false, error: err.message });
  }
});
```

---

## Hasil Review

### Keamanan

1. **SQL Injection**
   Query ke database masih menggunakan string interpolation langsung dari input user (`nodeId`, `result`, `err.message`). Ini rawan disusupi SQL injection.

   Saran: gunakan parameterized query atau ORM (misalnya Prisma) biar lebih aman.

2. **Remote Code Execution (RCE)**
   Penggunaan `eval()` di sini cukup berbahaya karena kita ngejalanin script dari user secara langsung. Jika disalahgunakan, user bisa akses file system, env, atau bahkan db.

   Saran: kalau memang harus eksekusi script dinamis, pakai sandbox seperti `vm2` atau minimal module `vm` dengan pembatasan ketat.

---

### Error Handling

1. **Error Async Tidak Tertangani**
   Query pertama (`UPDATE status = 'RUNNING'`) ada di luar `try/catch`. Kalau gagal, error-nya bisa lolos dan berpotensi membuat aplikasi crash.

   Saran: masukkan ke dalam `try/catch` atau handle error-nya secara eksplisit.

2. **Error Terlalu Terbuka ke Client**
   Mengirim `err.message` langsung ke client itu agak riskan karena bisa membocorkan informasi internal.

   Saran: cukup kirim pesan umum ke client, detail error simpan di log internal saja.

---

### Performa

1. **Blocking di Main Thread**
   `eval()` itu jalan secara sinkron. Kalau script dari user berat atau infinite loop, bisa freeze server (DoS).

   Saran: jalankan di worker thread atau proses terpisah. Bisa juga pakai queue system seperti BullMQ.

---

### Kualitas Kode

1. **Logika Dicampur Jadi Satu**
   Handler API ini mengerjakan semuanya sekaligus: HTTP handling, database, sampai logic eksekusi.

   Saran: pisahkan jadi beberapa layer, misalnya service dan repository biar lebih rapi dan mudah di maintain.

2. **Tidak Ada Validasi Input**
   `nodeId`, `script`, dan `variables` langsung dipakai tanpa validasi.

   Saran: tambahkan validasi pakai library seperti `zod` atau `class-validator`.

3. **Status Code Kurang Tepat**
   Semua response pakai status `200`, bahkan kalau error.

   Saran: gunakan status code yang sesuai, misalnya `400` untuk bad request atau `500` untuk server error.
