# אפשרויות אחסון - Audio-Press AI Server

## למה צריך אחסון?

כש-OpenAI מחזיר את האודיו, זה קובץ MP3 בינארי. צריך לאחסן אותו איפשהו כדי שהפלאגין יוכל להוריד אותו.

## אפשרויות אחסון (מ-פשוט ל-מורכב)

### ✅ אפשרות 1: אחסון מקומי על השרת (מומלץ למתחילים!)

**יתרונות:**
- ✅ הכי פשוט - אין צורך בהגדרות נוספות
- ✅ חינם - משתמש במקום הדיסק של השרת
- ✅ מהיר - הקבצים על השרת עצמו

**חסרונות:**
- ❌ אם השרת נפל - הקבצים נמחקים
- ❌ צריך לוודא שיש מקום דיסק מספיק

**איך זה עובד:**
1. השרת שומר את קבצי ה-MP3 בספרייה מקומית: `/var/www/audio-press-ai-server/audio-files/`
2. השרת מגיש את הקבצים דרך HTTP: `http://your-server.com/audio/filename.mp3`
3. הפלאגין מוריד את הקובץ משם

**הגדרה:**
```env
STORAGE_TYPE=local
SERVER_URL=https://api.audio-press.com
```

**זה כל מה שצריך!** ✅

---

### אפשרות 2: AWS S3 (מתקדם)

**יתרונות:**
- ✅ אמין מאוד - 99.999999999% uptime
- ✅ לא תלוי בשרת שלך
- ✅ קבצים לא נמחקים אם השרת נופל
- ✅ אפשר להגדיל בקלות

**חסרונות:**
- ❌ דורש הגדרת AWS (יותר מסובך)
- ❌ עלות נוספת (כמה סנט לקבצים)

**מתי להשתמש:**
- אם אתה מצפה לטווח רב משתמשים
- אם צריך אמינות מקסימלית
- אם יש לך כבר AWS account

**הגדרה:**
```env
STORAGE_TYPE=s3
AWS_ACCESS_KEY_ID=your_key
AWS_SECRET_ACCESS_KEY=your_secret
AWS_REGION=us-east-1
AWS_S3_BUCKET=your-bucket-name
```

---

## המלצה

**להתחלה: התחל עם `STORAGE_TYPE=local`**

זה הכי פשוט ולא דורש שום הגדרות חיצוניות. אחרי שהכל עובד, אם אתה צריך - תעבור ל-S3.

---

## איך להחליף בין אפשרויות

פשוט שנה את ה-`.env`:

```env
# לאחסון מקומי (פשוט)
STORAGE_TYPE=local
SERVER_URL=https://api.audio-press.com

# ל-S3 (מתקדם)
STORAGE_TYPE=s3
AWS_ACCESS_KEY_ID=...
AWS_SECRET_ACCESS_KEY=...
```

השרת יזהה וישתמש באופציה הנכונה אוטומטית!

---

## גיבוי קבצים (אם משתמש ב-local)

אם אתה משתמש ב-local storage, מומלץ לגבות את התיקייה `audio-files`:

```bash
# גיבוי יומי (הוסף ל-crontab)
0 2 * * * tar -czf /backups/audio-files-$(date +\%Y\%m\%d).tar.gz /var/www/audio-press-ai-server/audio-files/
```

---

## ניקוי קבצים ישנים

אם אתה משתמש ב-local storage, מומלץ לנקות קבצים ישנים:

```bash
# מחק קבצים ישנים מ-30 יום
find /var/www/audio-press-ai-server/audio-files/ -type f -mtime +30 -delete
```

או הוסף ל-`server.js`:

```javascript
// Cleanup old files (older than 30 days)
const cleanupOldFiles = () => {
    const files = fs.readdirSync(AUDIO_DIR);
    const now = Date.now();
    const thirtyDays = 30 * 24 * 60 * 60 * 1000;
    
    files.forEach(file => {
        const filePath = path.join(AUDIO_DIR, file);
        const stats = fs.statSync(filePath);
        if (now - stats.mtime.getTime() > thirtyDays) {
            fs.unlinkSync(filePath);
            console.log(`Deleted old file: ${file}`);
        }
    });
};

// Run cleanup daily
setInterval(cleanupOldFiles, 24 * 60 * 60 * 1000);
```

---

**סיכום: התחל עם `local` - זה כל מה שצריך!** 🚀

