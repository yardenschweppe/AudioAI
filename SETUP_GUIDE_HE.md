# מדריך הגדרה מלא - Audio-Press AI

## 🚀 שלב 1: הגדרת השרת (Node.js)

### 1.1 התקנת תלותיות

בתיקיית `audio-press-ai-server` הרץ:

```bash
cd audio-press-ai-server
npm install
```

### 1.2 יצירת קובץ `.env`

צור קובץ `.env` בתיקיית השרת עם התוכן הבא:

```env
# Freemius Credentials (מקבל מ-Freemius Dashboard)
FREEMIUS_DEVELOPER_ID=your_developer_id_here
FREEMIUS_PUBLIC_KEY=your_public_key_here
FREEMIUS_SECRET_KEY=your_secret_key_here
FREEMIUS_PLUGIN_ID=your_plugin_id_here

# OpenAI API Key (מקבל מ-https://platform.openai.com/api-keys)
OPENAI_API_KEY=sk-your-openai-api-key-here

# Port (אופציונלי, ברירת מחדל: 3000)
PORT=3000

# Admin Key (אופציונלי, להגנת נתיבי admin)
ADMIN_KEY=your-secret-admin-key-here

# Node Environment
NODE_ENV=production
```

### 1.3 איך למצוא את פרטי Freemius?

1. התחבר ל-[Freemius Dashboard](https://dashboard.freemius.com/)
2. בחר את הפלאגין שלך (או צור אחד חדש)
3. לך ל-Settings > Integration > API Credentials
4. העתק את:
   - Developer ID
   - Public Key
   - Secret Key
   - Plugin ID

### 1.4 איך למצוא את מפתח OpenAI?

1. התחבר ל-[OpenAI Platform](https://platform.openai.com/)
2. לך ל-API Keys
3. צור מפתח חדש או השתמש בקיים
4. העתק את המפתח (`sk-...`)

### 1.5 הפעלת השרת

**לפיתוח:**
```bash
npm run dev
```

**לפרודקשן (מומלץ עם PM2):**
```bash
npm install -g pm2
pm2 start server.js --name audio-press-ai-server
pm2 save
pm2 startup  # להפעלה אוטומטית לאחר אתחול
```

### 1.6 בדיקת השרת

בדוק שהשרת פועל:
```bash
curl http://localhost:3000/health
```

אם השרת על שרת מרוחק, החלף `localhost` בכתובת ה-IP או הדומיין שלך.

---

## 📦 שלב 2: הגדרת פלאגין WordPress

### 2.1 העלאה לשרת WordPress

1. העלה את התיקייה `audio-press-ai` לשרת ה-WordPress שלך:
   ```
   /wp-content/plugins/audio-press-ai/
   ```

2. ודא שהקבצים הבאים קיימים:
   - `audio-press-ai.php`
   - `includes/class-audio-press-ai.php`
   - `assets/css/`
   - `assets/js/`

### 2.2 עדכון קובץ הפלאגין הראשי

ערוך את `audio-press-ai.php` ועדכן:

1. **כתובת שרת ה-API** (שורה 23):
   ```php
   define('AUDIO_PRESS_AI_API_URL', 'https://your-server-domain.com'); // החלף בכתובת השרת שלך
   ```

2. **Freemius Credentials** (שורות 36-39):
   ```php
   'id'                  => 'YOUR_PLUGIN_ID', // החלף ב-Plugin ID מ-Freemius
   'public_key'          => 'YOUR_PUBLIC_KEY', // החלף ב-Public Key מ-Freemius
   ```

### 2.3 התקנת Freemius SDK

אם אין לך תיקיית `freemius` בתוך הפלאגין:
1. הורד את [Freemius SDK](https://github.com/Freemius/wordpress-sdk)
2. העלה את התיקייה `freemius` לתוך תיקיית הפלאגין

### 2.4 הפעלת הפלאגין

1. התחבר ל-WordPress Admin
2. לך ל-Plugins
3. מצא את "Audio-Press AI"
4. לחץ על "Activate"

### 2.5 הגדרת הפלאגין

1. לך ל-Settings > Audio-Press AI
2. הזן את כתובת שרת ה-API (שרת ה-Node.js שלך)
3. בחר קול ומודל (ברירת מחדל: `nova` ו-`tts-1-hd`)

---

## 🔧 שלב 3: בדיקות

### 3.1 בדיקת שרת API

```bash
# בדיקת health endpoint
curl https://your-server.com/health

# תגובה צפויה:
# {"status":"ok","timestamp":"2025-01-XX...","note":"..."}
```

### 3.2 בדיקת WordPress Plugin

1. פתח פוסט חדש ב-WordPress
2. לחץ על "Generate Audio" (אם יש לך רישיון Freemius פעיל)
3. בדוק שהאודיו נוצר והשמיעות עובדת

---

## 🌐 שלב 4: הגדרות Production (מומלץ)

### 4.1 HTTPS

ודא שיש לך תעודת SSL על השרת:
- Let's Encrypt (חינם)
- Cloudflare (חינם)

### 4.2 Firewall

פתח את הפורט שבו השרת רץ (ברירת מחדל: 3000):
```bash
# Ubuntu/Debian
sudo ufw allow 3000/tcp

# CentOS/RHEL
sudo firewall-cmd --permanent --add-port=3000/tcp
sudo firewall-cmd --reload
```

### 4.3 Reverse Proxy (מומלץ)

השתמש ב-Nginx או Apache כדי להציג את השרת על פורט 80/443:

**דוגמה ל-Nginx:**
```nginx
server {
    listen 80;
    server_name api.yourdomain.com;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
```

### 4.4 PM2 (Process Manager)

התקן PM2 לניהול השרת:
```bash
npm install -g pm2
pm2 start server.js --name audio-press-ai-server
pm2 save
pm2 startup
```

---

## 🐛 פתרון בעיות

### השרת לא מתחיל?

1. בדוק ש-Node.js מותקן: `node -v` (צריך 14+)
2. בדוק שהתלויות מותקנות: `npm install`
3. בדוק את קובץ `.env` - כל המשתנים מוגדרים?

### שגיאת Freemius?

1. ודא שה-Credentials נכונים ב-`.env`
2. בדוק שהרישיון פעיל ב-Freemius Dashboard
3. בדוק את הלוגים: `pm2 logs audio-press-ai-server`

### שגיאת OpenAI?

1. ודא שהמפתח תקין ושיש לך יתרה
2. בדוק את ה-Usage Dashboard של OpenAI

### WordPress לא מתחבר לשרת?

1. בדוק את כתובת ה-API בהגדרות הפלאגין
2. ודא שיש HTTPS (או שהשרת מאפשר HTTP)
3. בדוק את ה-CORS (אמור לעבוד עם הקוד הנוכחי)

---

## 📊 ניטור ושימוש

### צפייה בסטטיסטיקות

```bash
curl -H "x-admin-key: your-admin-key" https://your-server.com/admin/stats
```

### לוגים

```bash
# PM2
pm2 logs audio-press-ai-server

# או אם רץ ישירות
npm start
```

---

## ✅ סיכום - רשימת משימות

- [ ] התקנת Node.js ותלויות בשרת
- [ ] יצירת קובץ `.env` עם כל המשתנים
- [ ] קבלת Freemius Credentials
- [ ] קבלת OpenAI API Key
- [ ] הפעלת השרת (PM2 או אחר)
- [ ] עדכון כתובת API בפלאגין WordPress
- [ ] עדכון Freemius Credentials בפלאגין
- [ ] העלאת פלאגין ל-WordPress
- [ ] הפעלת הפלאגין
- [ ] בדיקת יצירת אודיו

**הכל עובד? 🎉 תוכל להתחיל ליצור אודיו לפוסטים שלך!**

