# 🍪 Graham Bytes - ICT Trivia Website

A fun, interactive ICT trivia website for **Graham Bytes** - premium graham balls snack with an ICT twist! Perfect for customers who scan QR codes on product packaging.

![Graham Bytes](https://img.shields.io/badge/Graham-Bytes-orange?style=for-the-badge)
![HTML5](https://img.shields.io/badge/HTML5-E34F26?style=for-the-badge&logo=html5&logoColor=white)
![CSS3](https://img.shields.io/badge/CSS3-1572B6?style=for-the-badge&logo=css3&logoColor=white)
![JavaScript](https://img.shields.io/badge/JavaScript-F7DF1E?style=for-the-badge&logo=javascript&logoColor=black)

## 🎯 Features

- ✨ **50 Unique Trivia Questions** - Diverse ICT topics from programming to Filipino tech history
- 🎲 **Random Trivia System** - Every QR scan leads to a different trivia question
- 📱 **Mobile-First Design** - Optimized for smartphone QR code scanning
- 🏆 **Score Tracking** - Tracks correct answers, incorrect answers, and streaks
- 🎉 **Fun Animations** - Confetti celebrations and sparkle effects
- 💾 **Local Storage** - Remembers your scores across sessions
- 🌐 **100% Static** - No backend needed, perfect for GitHub Pages

## 📁 Project Structure

```
graham-bytes-trivia/
├── index.html              # Landing page
├── css/
│   └── style.css           # All styling and animations
├── js/
│   ├── random.js           # Random trivia redirector
│   └── trivia.js           # Trivia interaction logic
├── trivia/
│   ├── trivia-001.html     # First trivia question
│   ├── trivia-002.html
│   ├── ...
│   └── trivia-050.html     # Last trivia question
└── README.md               # This file
```

## 🚀 Deploying to GitHub Pages

### Step 1: Create a GitHub Repository

1. Go to [GitHub](https://github.com) and sign in
2. Click the **+** icon → **New repository**
3. Name it `graham-bytes-trivia` (or any name you prefer)
4. Leave it **Public**
5. Click **Create repository**

### Step 2: Upload Your Files

**Option A: Using GitHub Web Interface (Easiest)**

1. In your new repository, click **uploading an existing file**
2. Drag and drop the entire `graham-bytes-trivia` folder contents
3. Click **Commit changes**

**Option B: Using Git Command Line**

```bash
# Navigate to your project folder
cd graham-bytes-trivia

# Initialize git
git init

# Add all files
git add .

# Commit
git commit -m "Initial commit - Graham Bytes ICT Trivia"

# Add remote (replace YOUR-USERNAME with your GitHub username)
git remote add origin https://github.com/YOUR-USERNAME/graham-bytes-trivia.git

# Push to GitHub
git push -u origin main
```

### Step 3: Enable GitHub Pages

1. Go to your repository on GitHub
2. Click **Settings** (tab at the top)
3. Scroll down to **Pages** (in the left sidebar)
4. Under **Source**, select **Deploy from a branch**
5. Select **main** branch and **/ (root)** folder
6. Click **Save**
7. Wait 1-2 minutes for deployment

### Step 4: Get Your Live URL

Your site will be live at:
```
https://YOUR-USERNAME.github.io/graham-bytes-trivia/
```

## 🔗 QR Code URLs

For your product packaging QR codes, use the **random.html** URL:

```
https://YOUR-USERNAME.github.io/graham-bytes-trivia/js/random.js
```

Wait, that's the JS file! For QR codes, create this redirect page or use:

### Main Entry Points:

| Purpose | URL |
|---------|-----|
| Landing Page | `https://YOUR-USERNAME.github.io/graham-bytes-trivia/` |
| Random Trivia (for QR) | `https://YOUR-USERNAME.github.io/graham-bytes-trivia/index.html` |
| Direct Trivia #1 | `https://YOUR-USERNAME.github.io/graham-bytes-trivia/trivia/trivia-001.html` |

**For QR Codes:** Use the main landing page URL. Customers click "Start Trivia" to get a random question.

## 📝 Trivia Topics Covered

| Category | Sample Questions |
|----------|------------------|
| 💻 Programming | Python, Java, HTML/CSS basics |
| 🌐 Internet History | First website, WiFi, social media |
| 🎮 Gaming | PlayStation, Nintendo, Minecraft |
| 🏢 Tech Companies | Google, Apple, Microsoft, Meta |
| 🔒 Cybersecurity | Passwords, HTTPS, hackers |
| 🇵🇭 Filipino Tech | GCash, Philippine internet history |
| 🤖 Modern Tech | AI, ChatGPT, NFTs |
| 📱 Mobile | Android, iOS, smartphones |

## 🎨 Customization

### Changing Colors

Edit the CSS variables in `css/style.css`:

```css
:root {
    --primary-gold: #F5A623;
    --primary-gold-dark: #D4851F;
    --secondary-blue: #2E86AB;
    --secondary-blue-light: #00A8E8;
    --text-dark: #4A3520;
    --text-light: #6B5B4F;
}
```

### Adding More Trivia

1. Copy any existing `trivia-XXX.html` file
2. Rename it with the next number (e.g., `trivia-051.html`)
3. Update the question, options, and fun fact
4. Update `js/random.js` to increase `totalTrivia`:

```javascript
const totalTrivia = 51; // Change this number
```

## 📱 Generating QR Codes

Free QR code generators:
- [QR Code Generator](https://www.qr-code-generator.com/)
- [QRCode Monkey](https://www.qrcode-monkey.com/)
- [GoQR.me](https://goqr.me/)

**Recommended:** Use your landing page URL for a consistent experience.

## 🍪 About Graham Bytes

**Graham Bytes** is a premium graham balls snack with an ICT twist! Our product combines delicious flavors with fun tech trivia, making snacking both tasty and educational.

**Tagline:** *"Snack Smart, Learn Tech!"* 🍪💻

---

## 📄 License

© 2026 Graham Bytes. All rights reserved.

Made with ❤️ for entrepreneurship class.
