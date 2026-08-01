#!/bin/bash
# blog 部署脚本：走代理 + 从 bashrc 提取 Vercel token
export PATH="$HOME/.nvm/versions/node/v24.18.0/bin:$PATH"
export HTTPS_PROXY=http://192.168.1.14:10808 HTTP_PROXY=http://192.168.1.14:10808
source /home/dev/.bashrc 2>/dev/null
cd /home/dev/blog
echo "token len: ${#VERCEL_TOKEN}"
timeout 280 vercel deploy --prod --yes --token "$VERCEL_TOKEN" 2>&1 | tail -4
