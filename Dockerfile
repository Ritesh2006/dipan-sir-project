FROM python:3.10-slim

# Install system dependencies including ffmpeg for audio MP3 conversions
RUN apt-get update && apt-get install -y \
    ffmpeg \
    git \
    curl \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy requirements & install dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application source code
COPY . .

EXPOSE 8080

CMD ["python", "app/api/upload_server.py"]
