#!/bin/bash
# NVIDIA NIM Whisper Large V3 - GPU Server Setup Script
# Run this on your GPU server (T4 16GB or better)
#
# Usage:
#   chmod +x setup_nim_server.sh
#   export NGC_API_KEY="your-ngc-api-key"
#   ./setup_nim_server.sh

set -e

echo "=== NVIDIA NIM Whisper Large V3 Setup ==="
echo ""

# Check for NGC_API_KEY
if [ -z "$NGC_API_KEY" ]; then
    echo "ERROR: NGC_API_KEY not set."
    echo "Get your key from: https://build.nvidia.com/settings/api-keys"
    echo "Then run: export NGC_API_KEY='your-key-here'"
    exit 1
fi

# Check for NVIDIA GPU
if ! command -v nvidia-smi &> /dev/null; then
    echo "ERROR: nvidia-smi not found. Install NVIDIA drivers first."
    exit 1
fi

echo "GPU Info:"
nvidia-smi --query-gpu=name,memory.total --format=csv,noheader
echo ""

# Install Docker if not present
if ! command -v docker &> /dev/null; then
    echo "Installing Docker..."
    curl -fsSL https://get.docker.com | sh
fi

# Install NVIDIA Container Toolkit
if ! dpkg -l | grep -q nvidia-container-toolkit; then
    echo "Installing NVIDIA Container Toolkit..."
    curl -fsSL https://nvidia.github.io/libnvidia-container/gpgkey | \
        sudo gpg --dearmor -o /usr/share/keyrings/nvidia-container-toolkit-keyring.gpg
    curl -s -L https://nvidia.github.io/libnvidia-container/stable/deb/nvidia-container-toolkit.list | \
        sed 's#deb https://#deb [signed-by=/usr/share/keyrings/nvidia-container-toolkit-keyring.gpg] https://#g' | \
        sudo tee /etc/apt/sources.list.d/nvidia-container-toolkit.list
    sudo apt-get update && sudo apt-get install -y nvidia-container-toolkit
    sudo nvidia-ctk runtime configure --runtime=docker
    sudo systemctl restart docker
fi

# Stop existing container if running
docker rm -f whisper-nim 2>/dev/null || true

# Run Whisper Large V3 NIM
echo ""
echo "Starting Whisper Large V3 NIM container..."
echo "(First run will download ~3GB model, may take 5-10 minutes)"
echo ""

docker run -d --name whisper-nim \
    --runtime=nvidia \
    --gpus '"device=0"' \
    --shm-size=8GB \
    -e NGC_API_KEY="$NGC_API_KEY" \
    -e NIM_HTTP_API_PORT=9000 \
    -e NIM_TAGS_SELECTOR="name=whisper-large-v3,mode=ofl" \
    -p 9000:9000 \
    --restart unless-stopped \
    nvcr.io/nim/nvidia/whisper-large-v3:latest

echo ""
echo "Waiting for NIM to be ready..."
for i in $(seq 1 60); do
    if curl -s http://localhost:9000/v1/health/ready 2>/dev/null | grep -q "ready\|ok"; then
        echo ""
        echo "=== NIM Server Ready ==="
        echo "Endpoint: http://$(hostname -I | awk '{print $1}'):9000"
        echo "Health:   http://$(hostname -I | awk '{print $1}'):9000/v1/health/ready"
        echo ""
        echo "Test with:"
        echo "  curl -X POST http://localhost:9000/v1/audio/transcriptions \\"
        echo "    -F 'file=@test.wav' \\"
        echo "    -F 'model=nvidia/whisper-large-v3' \\"
        echo "    -F 'language=auto'"
        echo ""
        echo "Set in Render dashboard:"
        echo "  NIM_SERVER_URL = http://$(hostname -I | awk '{print $1}'):9000"
        exit 0
    fi
    echo -n "."
    sleep 5
done

echo ""
echo "WARNING: NIM did not become ready within 5 minutes."
echo "Check logs: docker logs whisper-nim"
echo "Check GPU:  nvidia-smi"
