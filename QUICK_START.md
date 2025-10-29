# 🚀 Quick Start Checklist

## על השרת שלך:

### 1. התקנת תלותיות
```bash
cd audio-press-ai-server
npm install
```

### 2. יצירת קובץ .env
```bash
nano .env
```

העתק את זה לתוך הקובץ (והחלף בערכים האמיתיים שלך):

```env
FREEMIUS_DEVELOPER_ID=your_id
FREEMIUS_PUBLIC_KEY=your_public_key
FREEMIUS_SECRET_KEY=your_secret_key
FREEMIUS_PLUGIN_ID=your_plugin_id
OPENAI_API_KEY=sk-your_key_here
PORT=3000
NODE_ENV=production
ADMIN_KEY=your_secret_key_here
```

### 3. הפעלת השרת
```bash
# אפשרות א': ישירות
npm start

# אפשרות ב': עם PM2 (מומלץ)
npm install -g pm2
pm2 start server.js --name audio-press-ai-server
pm2 save
```

---

## ב-WordPress:

### 1. עדכן את `audio-press-ai.php`:
- שורה 23: כתוב את כתובת השרת שלך (למשל: `https://api.yourdomain.com`)
- שורות 36, 39: העתק את ה-Freemius credentials

### 2. העלה את הפלאגין ל-`/wp-content/plugins/`

### 3. הפעל את הפלאגין ב-WordPress Admin

### 4. לך ל-Settings > Audio-Press AI ובדוק שהכל תקין

---

## ✅ בדיקה מהירה:

```bash
curl https://your-server-url.com/health
```

אמור להחזיר: `{"status":"ok",...}`

---

**למדריך מפורט: ראה `SETUP_GUIDE_HE.md`**

