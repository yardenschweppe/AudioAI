# Freemius API Manual Testing

סקריפטים לבדיקת API של Freemius ידנית כדי למצוא את ה-endpoint הנכון לאימות רישיונות.

## שימוש

### סקריפט Node.js (מומלץ)

הסקריפט הזה יוצר חתימות HMAC נכון ומנסה מספר endpoints שונים:

```bash
cd server
node test-freemius-api.js [LICENSE_KEY]
```

אם לא תעביר `LICENSE_KEY`, הוא ישתמש בערך ברירת מחדל.

**דוגמה:**
```bash
node test-freemius-api.js sk_S-7*x1234567890
```

הסקריפט יבדוק 5 endpoints שונים:
1. `POST /plugins/{id}/licenses.json` עם `license_key` ב-body
2. `POST /licenses/validate.json` עם `plugin_id` ו-`license_key` ב-body
3. `GET /plugins/{id}/licenses.json?license_key=...` עם `license_key` ב-query
4. `GET /plugins/{id}/licenses.json` (רשימת כל הרישיונות)
5. `POST /plugins/{id}/licenses/validate.json` (ה-endpoint המקוריתמשנו בו)

### סקריפט Bash (רק להצגת פקודות curl)

הסקריפט הזה מציג את פקודות ה-curl אבל **לא** מפעיל אותן (כי צריך ליצור חתימות HMAC):

```bash
cd server
./test-freemius-curl.sh [LICENSE_KEY]
```

## הגדרה

הסקריפטים קוראים את הערכים מ-`.env` או משתמשים בערכים ברירת מחדל מהקוד.

אם אתה רוצה לשנות את ה-credentials, צור קובץ `.env` בתיקיית `server/`:

```env
FREEMIUS_PRODUCT_ID=21493
FREEMIUS_API_KEY=your_api_key_here
FREEMIUS_SECRET_KEY=your_secret_key_here
FREEMIUS_PUBLIC_KEY=your_public_key_here
```

## מה הסקריפט עושה?

1. **יוצר חתימה Freemius (FS signature)**: 
   - משתמש ב-HMAC-SHA256
   - יוצר את ה-string to sign לפי הפורמט של Freemius
   - מוסיף את ה-headers הנדרשים (Date, Authorization, Content-MD5)

2. **בודק מספר endpoints**: 
   - מנסה כל endpoint בנפרד
   - מציג את התגובה המלאה
   - מסכם את התוצאות

3. **מציג סיכום**: 
   - איזה endpoints עבדו
   - איזה נכשלו
   - מה התגובה של כל אחד

## תוצאות

אם אחד ה-endpoints עובד, תראה:
```
✅ SUCCESS! Status: 200
Response: { ... }
```

אם כולם נכשלו, תראה:
```
❌ ERROR! Status: 400
Response: { "error": { ... } }
```

## פתרון בעיות

אם כל ה-endpoints נכשלים:
1. בדוק שה-credentials נכונים
2. בדוק את תיעוד ה-API של Freemius
3. פנה לתמיכה של Freemius כדי לבדוק מה ה-endpoint הנכון

## הערות

- הסקריפט Node.js משתמש ב-`axios` לשליחת בקשות
- החתימות נוצרות לפי הפורמט של Freemius SDK
- ה-Content-MD5 מחושב רק עבור POST/PUT requests
- ה-Date header בפורמט RFC (כמו `Sat, 14 Feb 2016 20:24:46 +0000`)

