#!/bin/sh

# this exits the script if any command fails
set -e

if [ -z "$SSH_KEY" ]; then
  echo "SSH_KEY variable missing, pass the path to the key as an argument to this script"
  exit 1
fi

if [ -z "$PUBLIC_IP" ]; then
  echo "PUBLIC_IP variable missing, pass the public ip address of the openresty instance as an argument to this script"
  exit 1
fi

if [ -z "$NODE_SERVER_IP" ]; then
  echo "NODE_SERVER_IP variable missing, pass the ip address of the node instance as an argument to this script"
  exit 1
fi

if [ -z "$REDIS_IP" ]; then
  echo "REDIS_IP variable missing, pass the ip address of the redis instance as an argument to this script"
  exit 1
fi


# build the openresty config files
echo "Building openresty config files..."
BUILD_SCRIPT="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )/build-config.js"
node $BUILD_SCRIPT

# upload all the built in the directory './data/latest'  
DATA_DIRECTORY="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )/data/latest"
echo "Uploading $DATA_DIRECTORY to ~/openresty on $PUBLIC_IP"
ssh -i $SSH_KEY ec2-user@$PUBLIC_IP "rm -rf /home/ec2-user/openresty"
scp -i $SSH_KEY -r $DATA_DIRECTORY ec2-user@$PUBLIC_IP:/home/ec2-user/openresty

#upload the scripts to the openresty server
SCRIPTS_DIRECTORY="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )/scripts"
echo "Uploading $SCRIPTS_DIRECTORY to ~/scripts on $PUBLIC_IP"
ssh -i $SSH_KEY ec2-user@$PUBLIC_IP "rm -rf /home/ec2-user/scripts"
scp -i $SSH_KEY -r $SCRIPTS_DIRECTORY ec2-user@$PUBLIC_IP:/home/ec2-user/scripts
ssh -i $SSH_KEY ec2-user@$PUBLIC_IP "chmod +x /home/ec2-user/scripts/*"

# run the setup.sh script as root and stream 
echo "Reloading openresty...."
ssh -i $SSH_KEY ec2-user@$PUBLIC_IP "sudo openresty -t"
ssh -i $SSH_KEY ec2-user@$PUBLIC_IP "sudo openresty -s reload"
echo "Reload complete."

#########################################################
# Begin Fail2Ban deployment section
#########################################################

FAIL2BAN_LOCAL_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )/fail2ban"

# Upload filters
for filter in "$FAIL2BAN_LOCAL_DIR"/filter.d/*.conf; do
  filter_name=$(basename "$filter")
  echo "Uploading filter $filter_name to $PUBLIC_IP:/etc/fail2ban/filter.d/"
  scp -i "$SSH_KEY" "$filter" ec2-user@$PUBLIC_IP:/tmp/"$filter_name"
  ssh -i "$SSH_KEY" ec2-user@$PUBLIC_IP "sudo mv /tmp/$filter_name /etc/fail2ban/filter.d/$filter_name && sudo chown root:root /etc/fail2ban/filter.d/$filter_name"
done

# Upload jail.local
echo "Uploading jail.local to $PUBLIC_IP:/etc/fail2ban/jail.local"
scp -i "$SSH_KEY" "$FAIL2BAN_LOCAL_DIR/jail.local" ec2-user@$PUBLIC_IP:/tmp/jail.local
ssh -i "$SSH_KEY" ec2-user@$PUBLIC_IP "sudo mv /tmp/jail.local /etc/fail2ban/jail.local && sudo chown root:root /etc/fail2ban/jail.local"

# Restart fail2ban
echo "Restarting fail2ban on $PUBLIC_IP"
ssh -i "$SSH_KEY" ec2-user@$PUBLIC_IP "sudo systemctl restart fail2ban"

echo "Fail2Ban deployment complete."
#########################################################

#########################################################
# Begin logrotate deployment section
#########################################################

LOGROTATE_LOCAL_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )/logrotate"

# Upload logrotate configs
for file in "$LOGROTATE_LOCAL_DIR"/[!.]*; do
  config_name=$(basename "$file")
  echo "Uploading logrotate config $config_name to $PUBLIC_IP:/etc/logrotate.d/"
  scp -i "$SSH_KEY" "$file" ec2-user@$PUBLIC_IP:/tmp/"$config_name"
  ssh -i "$SSH_KEY" ec2-user@$PUBLIC_IP "sudo mv /tmp/$config_name /etc/logrotate.d/$config_name && sudo chown root:root /etc/logrotate.d/$config_name && sudo chmod 644 /etc/logrotate.d/$config_name"
done

# Optionally, test logrotate config
echo "Testing logrotate config on $PUBLIC_IP"
ssh -i "$SSH_KEY" ec2-user@$PUBLIC_IP "sudo logrotate --debug /etc/logrotate.conf"

echo "logrotate deployment complete."
#########################################################

#########################################################
# Begin .bashrc deployment section
#########################################################

BASHRC_LOCAL_FILE="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )/.bashrc"

echo "Uploading .bashrc to $PUBLIC_IP:/home/ec2-user/.bashrc"
scp -i "$SSH_KEY" "$BASHRC_LOCAL_FILE" ec2-user@$PUBLIC_IP:/tmp/.bashrc
ssh -i "$SSH_KEY" ec2-user@$PUBLIC_IP "sudo mv /tmp/.bashrc /home/ec2-user/.bashrc && sudo chown ec2-user:ec2-user /home/ec2-user/.bashrc && sudo chmod 644 /home/ec2-user/.bashrc"

echo ".bashrc deployment complete."
#########################################################


echo "Deploy complete. To connect to the openresty server, run:"
echo "ssh -i $SSH_KEY ec2-user@$PUBLIC_IP"
