# מזהה ייחודי למשתמש - הסבר

## מערכת הזיהוי במערכת

המערכת משתמשת בשני סוגי מזהה ייחודיים:

### 1. **License Key (מזהה ראשי)**
- **מה זה:** המפתח הייחודי שהמשתמש מקבל מ-Freemius אחרי תשלום
- **איפה:** `license_key` - נשלח מהפלאגין לשרת בכל בקשה
- **שימוש:** 
  - הזיהוי הראשי לספירת שימוש (metering)
  - בדיקת רישיון מול Freemius
  - זיהוי המשתמש במערכת

### 2. **WordPress User ID (מזהה משני)**
- **מה זה:** המזהה הייחודי של המשתמש ב-WordPress
- **איפה:** `wp_user_id` - נשלח יחד עם ה-license_key
- **שימוש:**
  - מעקב כמה משתמשים שונים משתמשים באותה רישיון
  - ניתוח התנהגות משתמשים
  - דיבוג וטיפול בתמיכה

## איך זה עובד

### בפלאגין WordPress:
```php
// מקבל את ה-license_key מ-Freemius
$license_key = $this->get_license_key(); // e.g., "abc123xyz..."

// מקבל את ה-WP User ID
$wp_user_id = get_current_user_id(); // e.g., 5

// שולח שניהם לשרת
$response = $this->call_remote_api($api_url, $license_key, $wp_user_id, ...);
```

### בשרת המרוחק:
```javascript
// מקבל את שני המזהים
const { license_key, wp_user_id } = req.body;

// שומר ספירה לפי license_key (מזהה ראשי)
incrementGenerateCount(license_key, wp_user_id);

// שומר את כל ה-wp_user_ids ששימשו את הרישיון הזה
usageDB.get(license_key).wp_user_ids.add(wp_user_id);
```

## דוגמאות נתונים

### רישיון אחד עם משתמש אחד:
```json
{
  "license_key": "abc123...",
  "wp_user_ids": [5],
  "generate_count": 15,
  "chars_used": 50000
}
```

### רישיון אחד עם כמה משתמשים (Multi-site):
```json
{
  "license_key": "abc123...",
  "wp_user_ids": [5, 12, 23],  // 3 משתמשים שונים
  "unique_users": 3,
  "generate_count": 45,
  "chars_used": 120000
}
```

## יתרונות

✅ **זיהוי מדויק:** כל משתמש מזוהה באופן ייחודי
✅ **גמישות:** רישיון יכול לשמש כמה משתמשים (multi-site)
✅ **ניתוח:** אפשר לראות כמה משתמשים שונים משתמשים ברישיון
✅ **אבטחה:** כל פעולה מקושרת למשתמש ספציפי

## בנתוני הסטטיסטיקה

כשאתה קורא את `/admin/stats`, תראה:

```json
{
  "license_key": "abc12345...",
  "generate_count": 45,
  "wp_user_ids": [5, 12, 23],
  "unique_users": 3,  // כמה משתמשים שונים
  "chars_used": 120000
}
```

זה אומר:
- רישיון `abc12345...` שומש 45 פעמים
- על ידי 3 משתמשים שונים (IDs: 5, 12, 23)
- נוצל 120,000 תווים

---

**סיכום:** כל משתמש מזוהה ייחודית דרך `license_key` (ראשי) + `wp_user_id` (משני) להבנה טובה יותר של השימוש.

