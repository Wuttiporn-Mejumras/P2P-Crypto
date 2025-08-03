@@ -0,0 +1,32 @@
# P2P-Crypto

โปรเจกต์ระบบซื้อขายคริปโตแบบ P2P (Fiat & Crypto) พัฒนาด้วย Node.js + Express + SQLite

---

## ⚙️ ขั้นตอนการติดตั้งและ Run Project

1. ติดตั้ง dependency:
   ```bash
   npm install

   npx knex migrate:latest

   ในส่วนของ(npx knex migrate:latest) ถ้า run แล้ว 
   error ENOENT: no such file or directory, scandir 'C:\Users\bestb\P2P-test\migrations'
   Error: ENOENT: no such file or directory, scandir 'C:\Users\bestb\P2P-test\migrations'
   สามารถ  npm start ได้เลย แต่ถ้าใช้ได้ปกติ run คำสั่งต่อไป
   npx knex seed:run
   npm start
   การใช้งาน

2. การใช้งาน

- Create Wallet
- บันทึก Address , Private Key ของตัวเอง (ใช้ Address, Private Key ในการ login ครั้งต่อไป)
- Deposit สกุลเงินที่ต้องการได้ทั้ง fiat, crypto
- ปุ่ม Wallet(ดูยอด balance)
- ปุ่มตั้งขาย (create sell order และมีปุ่ม ยกเลิก order สำหรับ order ของตัวเอง)
- ปุ่มตั้งซื้อ (create buy order และมีปุ่ม ยกเลิก order สำหรับ order ของตัวเอง)
- ขายทันที (แสดง Order list ที่เปิดตั้งซื้อไว้แล้วสามารถขายให้ order นั้นได้เลย)
- ซื้อทันที (แสดง Order list ที่เปิดตั้งขายไว้แล้วสามารถซื้อ order นั้นได้เลย)
No newline at end of file
