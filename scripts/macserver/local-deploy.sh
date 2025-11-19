scp -r ./app/clients localmacserver:~/blot/app/

ssh localmacserver "export NVM_DIR=\"\$HOME/.nvm\" && [ -s \"\$NVM_DIR/nvm.sh\" ] && \. \"\$NVM_DIR/nvm.sh\" && pm2 restart macserver"