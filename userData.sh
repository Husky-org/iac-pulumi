
cd /opt/csye6225
touch .env
echo "DB_NAME=${DB_NAME}" >> .env
echo "DB_USER=${WEBAPP_DB_USER}" >> .env
echo "DB_PASSWORD=${DB_PASSWORD}" >> .env
echo "DB_HOST=${DB_HOST}" >> .env
echo "DB_DIALECT=${DB_DIALECT}" >> .env

sudo chown -R csye6225:csye6225 /opt/csye6225
