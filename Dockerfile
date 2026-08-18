FROM python:3.10-slim

# Install system dependencies including ffmpeg for audio MP3 conversions
RUN apt-get update && apt-get install -y \
    ffmpeg \
    git \
    curl \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Set Python Path & Environment Variables so uploads succeed on Render
ENV PYTHONPATH=/app
ENV PORT=8080
ENV TARGET_DRIVE_FOLDER_ID=1aaD44uttnMpWdLo19tko-8Ipl3_MUhbk
ENV GOOGLE_APPS_SCRIPT_URL=https://script.google.com/macros/s/AKfycbwzV4dCMkXfNYM2bxGHMe1l_I5n72-GMfccyAuyoEhSq_cYGnhVjU3Ql-PNOxStNyEs/exec

# Copy requirements & install dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application source code
COPY . .

EXPOSE 8080

CMD ["python", "app/api/upload_server.py"]
