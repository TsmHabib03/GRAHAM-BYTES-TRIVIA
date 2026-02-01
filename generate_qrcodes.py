"""
Generate QR codes for all Graham Bytes trivia pages
"""
import qrcode
import os

# Create qrcodes folder if it doesn't exist
output_dir = "qrcodes"
os.makedirs(output_dir, exist_ok=True)

# Base URL for the trivia pages (GitHub Pages format)
# Update this with your actual GitHub Pages URL after deployment
base_url = "https://tsmhabib03.github.io/GRAHAM-BYTES-TRIVIA/trivia"

# Generate QR codes for trivia 001-050
for i in range(1, 51):
    # Format the trivia number with leading zeros (001, 002, ... 050)
    trivia_num = f"{i:03d}"
    
    # Full URL for this trivia page
    url = f"{base_url}/trivia-{trivia_num}.html"
    
    # Create QR code
    qr = qrcode.QRCode(
        version=1,
        error_correction=qrcode.constants.ERROR_CORRECT_H,  # High error correction for better scanning
        box_size=10,
        border=4,
    )
    qr.add_data(url)
    qr.make(fit=True)
    
    # Create image with custom colors (can be customized)
    img = qr.make_image(fill_color="black", back_color="white")
    
    # Save the QR code
    filename = f"{output_dir}/qr-trivia-{trivia_num}.png"
    img.save(filename)
    print(f"✅ Generated: {filename}")

print(f"\n🎉 All 50 QR codes have been saved to the '{output_dir}' folder!")
print(f"\n⚠️  IMPORTANT: Update the 'base_url' in this script with your actual GitHub Pages URL")
print(f"   Example: https://tsmhabib03.github.io/GRAHAM-BYTES-TRIVIA/trivia")
