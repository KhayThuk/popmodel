# ป๊อกเด้งนักเรียน — LINE OA starter

Starter สำหรับ Next.js App Router, Prisma และ PostgreSQL ที่ deploy บน Vercel ได้
เครดิตในตัวอย่างเป็นแต้มจำลอง ไม่มีการเชื่อมต่อเงินจริง

## โครงสร้าง

```text
.
├── prisma/
│   └── schema.prisma
├── src/
│   ├── app/
│   │   └── api/
│   │       ├── auth/
│   │       │   └── line/
│   │       │       ├── callback/route.ts
│   │       │       └── login/route.ts
│   │       └── line/
│   │           └── webhook/
│   │               └── route.ts
│   └── lib/
│       ├── line.ts
│       └── prisma.ts
├── .env.example
├── package.json
└── tsconfig.json
```

## ตั้งค่าและ Deploy

1. ใช้ PostgreSQL ที่เข้าถึงได้จาก Vercel และตั้ง `DATABASE_URL` ใน local/Vercel
2. คัดลอก `.env.example` เป็น `.env` แล้วตั้ง Messaging API access token/secret,
   LINE Login channel ID/secret/callback URL และ LINE user IDs ของแอดมิน (คั่นด้วย comma)
3. ติดตั้ง dependencies แล้วรัน `npm run db:generate` และ `npm run db:push`
   สำหรับ production ควรสร้างและ deploy Prisma migrations แทนการใช้ `db push`
4. ตั้ง LINE Messaging API webhook URL เป็น
   `https://<domain>/api/line/webhook` และเปิด Use webhook ใน LINE Developers Console
5. ตรวจสอบว่า runtime มี Node.js และตั้ง Environment Variables ใน Vercel ครบ

## คำสั่งในกลุ่ม

- `1/20` ถึง `6/20`: วางเครดิตในขาที่ระบุ
- `จ/400`: วางเครดิตฝั่งเจ้ามือ
- `c`: เช็คเครดิต
- แอดมิน `3`, `2`, `1`: ส่ง Flex นับถอยหลัง
- เมื่อส่ง `3` จะเปิดรอบเดิมพันใหม่ หากยังไม่มีรอบ OPEN
- แอดมิน `A`: ปิดรับเดิมพันรอบล่าสุดที่เปิดอยู่
- แอดมิน `S24,14,27,14,15,9,20`: สรุปผลตามลำดับเจ้ามือและขา 1–6

`LINE_LOGIN_URL` ควรชี้ไปที่ `/api/auth/line/login` และตั้ง callback URI ใน LINE Developers
ให้ตรงกับ `LINE_LOGIN_CALLBACK_URL` ทุกตัวอักษร Login route สร้างและตรวจ `state`, แลก
authorization code และตรวจ ID token กับ LINE ก่อน upsert user; เครดิต 10,000 ถูกกำหนด
เฉพาะตอนสร้างบัญชีใหม่ จากนั้น push Flex พร้อมลิงก์เข้ากลุ่ม

## สมมติฐานกติกาในตัวอย่าง

- แต้มเก็บเป็นหลักหน่วย (`แต้มรวม % 10`)
- ขาที่มากกว่าเจ้ามือชนะและรับคืนรวมเงินเดิมพัน x2; เสมอคืนเงินเดิมพัน
- เดิมพันเจ้ามือชนะเมื่อแต้มเจ้ามือมากกว่าทุกขา; ถ้าเสมอกับขาใดขาหนึ่งให้คืนเดิมพัน
- ยอดเดิมพันถูกหักทันที และคืน/จ่ายตอนสรุปผล
- ตัวอย่างตั้งใจรองรับกลุ่มเกมเดียว และแอดมินควรเริ่มรอบด้วย `3` ก่อนเปิดเดิมพัน

## ก่อนใช้งานจริง

เพิ่ม LINE Login callback และ session ที่ปลอดภัย, rate limiting, การตรวจ event ซ้ำสำหรับทุก
คำสั่ง, การจัดการกรณี LINE retry, และ locking/ระดับ isolation ที่เหมาะสมต่อการเปิด/ปิดรอบ
พร้อมทดสอบกติกาการจ่ายเงินจริง (ถ้ามี) แยกจากเครดิตจำลอง ตัวอย่างนี้ไม่ใช่ระบบการเงิน
และการประมวลผล webhook อาจต้องออกแบบ idempotency เพิ่มก่อนรับโหลด production
