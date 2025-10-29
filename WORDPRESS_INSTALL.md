# 📦 מדריך התקנת הפלאגין ב-WordPress

## שלב 1: הורדת Freemius SDK

הפלאגין משתמש ב-Freemius SDK שצריך להוריד:

1. לך ל: https://github.com/Freemius/wordpress-sdk
2. לחץ על "Code" → "Download ZIP"
3. חלץ את הקובץ
4. העתק את התיקייה `freemius` לתוך `audio-press-ai/`

**המבנה הסופי צריך להיות:**
```
audio-press-ai/
├── audio-press-ai.php
├── freemius/          ← צריך להוסיף
│   └── start.php
├── includes/
│   └── class-audio-press-ai.php
└── assets/
    ├── css/
    └── js/
```

## שלב 2: עדכון פרטי Freemius

ערוך את `audio-press-ai.php` ועדכן:

1. **שורה 23**: כתובת שרת ה-API שלך
   ```php
   define('AUDIO_PRESS_AI_API_URL', 'https://your-server-url.com');
   ```

2. **שורה 36**: Plugin ID מ-Freemius
   ```php
   'id' => '21493', // זה ה-Plugin ID שלך
   ```

3. **שורה 39**: Public Key מ-Freemius
   ```php
   'public_key' => 'pk_c1f4731e093f2279f624161d5ee8b', // ה-Public Key שלך
   ```

## שלב 3: העלאה ל-WordPress

### דרך 1: דרך cPanel/FTP

1. התחבר לשרת שלך
2. לך ל-`/wp-content/plugins/`
3. העלה את כל תיקיית `audio-press-ai`

**הנתיב הסופי צריך להיות:**
```
/wp-content/plugins/audio-press-ai/
├── audio-press-ai.php
├── freemius/
├── includes/
└── assets/
```

### דרך 2: דרך WP Admin (אם יש גישה)

1. לך ל-`Plugins` → `Add New` → `Upload Plugin`
2. צור ZIP של התיקייה `audio-press-ai`
3. העלה את הקובץ ZIP

## שלב 4: הפעלת הפלאגין

1. לך ל-`Plugins` ב-WordPress Admin
2. מצא את "Audio-Press AI"
3. לחץ על "Activate"

## שלב 5: הגדרות ראשוניות

1. לך ל-`Settings` → `Audio-Press AI`
2. הזן את כתובת שרת ה-API שלך:
   ```
   https://your-server-url.com
   ```
3. בחר קול ומודל (ברירת מחדל: `nova` ו-`tts-1-hd`)
4. שמור הגדרות

## ⚠️ בעיות נפוצות

### שגיאה: "freemius/start.php not found"
**פתרון:** הוסף את תיקיית `freemius` כפי שמפורט בשלב 1

### שגיאה: "API Server URL not configured"
**פתרון:** לך ל-Settings → Audio-Press AI והזן את כתובת השרת

### הפלאגין לא מופיע
**פתרון:** ודא שהתיקייה נקראת בדיוק `audio-press-ai` ושהיא בתוך `/wp-content/plugins/`

## ✅ בדיקה

1. פתח פוסט חדש ב-WordPress
2. בדוק אם יש כפתור "Generate Audio"
3. אם יש לך רישיון Freemius פעיל - נסה ליצור אודיו
4. אם אתה במצב בדיקה - השתמש ב-`license_key: "TEST"` (אם השרת ב-development mode)

---

**הערה:** התיקייה `audio-ai` היא תיקייה ישנה/גיבוי - אל תעלה אותה!

