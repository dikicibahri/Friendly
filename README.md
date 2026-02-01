# Friendly Web Application

Web versiyonu of the Friendly Android app - Grup görevlerini takip et, arkadaşlarınla birlikte başarı kazan!

## 🎯 Özellikler

### ✅ Temel Özellikler
- **Google Authentication** - Firebase ile güvenli giriş
- **Dark/Light Mode** - Tema değiştirme
- **Responsive Design** - Mobil, tablet ve desktop uyumlu
- **Real-time Sync** - Firebase Realtime Database ile anlık senkronizasyon

### 🏟️ Arena (Tüm Kullanıcılar)
- Tüm grup üyelerinin görev durumlarını gör
- Yatay kaydırmalı kullanıcı kartları
- Kullanıcı kartına tıklayarak görevlerini görüntüle
- Trust score ve tamamlanma oranı gösterimi

### ✅ Görevlerim (Action)
- Kendi görevlerini listele
- Kaydırarak tamamla özelliği
- Admin özelliği: Görev ekleme ve silme
- Task durumları: Pending, Awaiting Approval, Done, Vetoed, Expired

### ⚙️ Ayarlar
- Profil bilgileri
- Grup bilgisi ve davet kodu
- Tema değiştirme
- **Stalker Radar** - Görevlerini kimler görüntüledi?
- Çıkış yap

### 👑 Admin Özellikleri
- Görev ekleme (deadline'lı veya süresiz)
- Görev silme
- Görev onaylama/reddetme (Awaiting durumundaki görevler için)

## 📋 Kurulum

### 1. Firebase Projesi Oluştur

1. [Firebase Console](https://console.firebase.google.com/) üzerinden yeni bir proje oluştur veya mevcut Android projenizi kullanın
2. **Authentication** > **Sign-in method** > **Google** provider'ı aktif et
3. **Realtime Database** oluştur (Test mode'da başlatabilirsiniz, sonra rules güncelleyin)
4. **Project Settings** > **Your apps** > **Web app** ekle
5. Firebase config bilgilerinizi kopyalayın

### 2. Firebase Config Güncelle

`firebase-config.js` dosyasını açın ve Firebase config bilgilerinizi yapıştırın:

```javascript
const firebaseConfig = {
  apiKey: "BURAYA_API_KEY",
  authDomain: "BURAYA_AUTH_DOMAIN",
  databaseURL: "BURAYA_DATABASE_URL",
  projectId: "BURAYA_PROJECT_ID",
  storageBucket: "BURAYA_STORAGE_BUCKET",
  messagingSenderId: "BURAYA_SENDER_ID",
  appId: "BURAYA_APP_ID"
};
```

### 3. Authorized Domains Ekle

Firebase Console > Authentication > Settings > Authorized domains

- `localhost` (development için)
- Production domain'iniz (deploy edecekseniz)

### 4. Çalıştır

#### Option 1: VS Code Live Server
1. VS Code'da Live Server extension'ı yükleyin
2. `login.html` veya `index.html` dosyasına sağ tıklayıp "Open with Live Server" seçin

#### Option 2: Python HTTP Server
```bash
cd r:\Friendly_web
python -m http.server 8000
```
Tarayıcıda: `http://localhost:8000/login.html`

#### Option 3: Node.js Serve
```bash
npx serve r:\Friendly_web
```

## 🗂️ Dosya Yapısı

```
r:\Friendly_web\
├── login.html          # Giriş sayfası
├── index.html          # Ana dashboard (Arena, Görevlerim, Ayarlar)
├── app.js              # Ana uygulama mantığı
├── firebase-config.js  # Firebase yapılandırması
├── style.css           # Tüm stiller (dark/light mode)
└── README.md           # Bu dosya
```

## 🔥 Firebase Database Yapısı

Android uygulamayla aynı yapıyı kullanır:

```
/users/{userId}
  - uid, name, email, currentGroupId, globalTrustScore, streak_count

/groups/{groupId}
  /metadata
    - groupId, groupName, inviteCode, createdBy, createdAt
  
  /members/{userId}
    - userId, userName, role, status, trustScore, vetoCount
  
  /tasks/{taskId}
    - taskId, title, createdBy, createdAt, isActive, deadlineTimestamp
  
  /logs/{YYYY-MM-DD}/{logId}
    - logId, userId, taskId, date, status, timestamp, approvedBy

/audit_logs/{targetUserId}/{logId}
  - message, timestamp, viewerName

/inviteCodes/{code} -> groupId
```

## 🔒 Güvenlik Kuralları (Database Rules)

Firebase Realtime Database Rules:

```json
{
  "rules": {
    "users": {
      "$uid": {
        ".read": "$uid === auth.uid",
        ".write": "$uid === auth.uid"
      }
    },
    "groups": {
      "$groupId": {
        ".read": "auth != null && root.child('groups/' + $groupId + '/members/' + auth.uid).exists()",
        ".write": "auth != null && root.child('groups/' + $groupId + '/members/' + auth.uid).exists()"
      }
    },
    "audit_logs": {
      "$userId": {
        ".read": "$userId === auth.uid",
        ".write": "auth != null"
      }
    },
    "inviteCodes": {
      ".read": "auth != null",
      ".write": "auth != null"
    }
  }
}
```

## 🚀 Deploy

### Netlify (Önerilen)
1. GitHub'a push edin
2. [Netlify](https://netlify.com) üzerinde repo'yu bağlayın
3. Deploy edin

### Firebase Hosting
```bash
npm install -g firebase-tools
firebase login
firebase init hosting
firebase deploy
```

### Vercel
```bash
npm install -g vercel
vercel
```

## 🔄 Android App ile Senkronizasyon

Web uygulaması Android uygulamayla **aynı Firebase projesini** kullandığı için:

✅ Web'de işaret edilen görev → Anında Android'de güncellenir  
✅ Android'de işaret edilen görev → Anında Web'de güncellenir  
✅ Admin web'de görev ekler → Android'de görünür  
✅ Stalker Radar iki platformda da çalışır

## 🎨 Özelleştirme

### Renkler
`style.css` içindeki CSS variables'ları düzenleyin:

```css
:root {
  --accent-primary: #6366F1;
  --accent-secondary: #8B5CF6;
  /* ... */
}
```

### Tema
Varsayılan tema: Dark  
Kullanıcı ayarlardan değiştirebilir, localStorage'da saklanır

## 📱 Tarayıcı Desteği

- ✅ Chrome 90+
- ✅ Firefox 88+
- ✅ Safari 14+
- ✅ Edge 90+

## 🐛 Sorun Giderme

### "Firebase config is not defined"
- `firebase-config.js` dosyasını doğru doldurdunuz mu?
- Export statement'ı kaldırmadınız mı?

### "CORS Error"
- Dosyaları bir HTTP server üzerinden açın (`file://` protokolü çalışmaz)
- Firebase Authorized Domains'e localhost ekleyin

### "Not authorized"
- Firebase Authentication'da Google provider aktif mi?
- Database Rules doğru ayarlandı mı?

## 📄 Lisans

Bu proje Friendly Android uygulamasının web versiyonudur.

---

**Geliştirici Notu:** Bu web uygulaması, Android uygulamasıyla %100 uyumlu çalışacak şekilde tasarlanmıştır. Aynı Firebase projesini kullanarak real-time senkronizasyon sağlar.
