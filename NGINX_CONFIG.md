# הגדרת Nginx ל-Audio-Press AI

## אפשרות 1: נתיב `/audio-api/` (מומלץ)

### הוסף ל-block של `chatix.co.il` (אחרי `location /socket.io/`):

```nginx
# Audio-Press AI API
location /audio-api/ {
    proxy_pass http://localhost:3000/;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection 'upgrade';
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_cache_bypass $http_upgrade;
    
    # Timeouts (חשוב לאודיו שיכול לקחת זמן)
    proxy_connect_timeout 120s;
    proxy_send_timeout 120s;
    proxy_read_timeout 120s;
    
    # Allow larger request bodies (for audio data)
    client_max_body_size 50M;
}
```

### עדכון הפלאגין:

ערוך `audio-press-ai.php` שורה 23:
```php
define('AUDIO_PRESS_AI_API_URL', 'https://chatix.co.il/audio-api');
```

---

## אפשרות 2: תת-דומיין `audio-api.chatix.co.il`

### הוסף block חדש אחרי block של `chatix.co.il`:

```nginx
# ---------------- Audio-Press AI API (HTTPS) ----------------
server {
    listen 443 ssl http2;
    server_name audio-api.chatix.co.il;

    ssl_certificate /etc/letsencrypt/live/chatix.co.il/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/chatix.co.il/privkey.pem;
    include /etc/letsencrypt/options-ssl-nginx.conf;
    ssl_dhparam /etc/letsencrypt/ssl-dhparams.pem;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
        
        # Timeouts (חשוב לאודיו שיכול לקחת זמן)
        proxy_connect_timeout 120s;
        proxy_send_timeout 120s;
        proxy_read_timeout 120s;
        
        # CORS (אם צריך)
        add_header 'Access-Control-Allow-Origin' '*' always;
        add_header 'Access-Control-Allow-Methods' 'GET, POST, OPTIONS' always;
        add_header 'Access-Control-Allow-Headers' 'Content-Type, Authorization, x-admin-key' always;
        
        if ($request_method = 'OPTIONS') {
            return 204;
        }
        
        # Allow larger request bodies
        client_max_body_size 50M;
    }
}
```

### עדכון הפלאגין:

ערוך `audio-press-ai.php` שורה 23:
```php
define('AUDIO_PRESS_AI_API_URL', 'https://audio-api.chatix.co.il');
```

---

## המלצה: אפשרות 1 (נתיב `/audio-api/`)

**יתרונות:**
- אין צורך בתעודת SSL נוספת
- אין צורך תת-דומיין
- יותר פשוט

**צעדים:**
1. הוסף את ה-`location` block לעיל
2. עדכן את `audio-press-ai.php` ל-`https://chatix.co.il/audio-api`
3. Reload את Nginx: `sudo nginx -t && sudo systemctl reload nginx`
4. בדוק: `curl https://chatix.co.il/audio-api/health`

---

## חשוב: וודא שהשרת Node.js רץ!

```bash
# בדוק שהשרת רץ
pm2 status

# או בדוק ידנית
curl http://localhost:3000/health
```

