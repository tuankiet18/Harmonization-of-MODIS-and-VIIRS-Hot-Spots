#!/bin/bash
# EC2 first-boot script (Ubuntu 24.04), run as root by cloud-init. launch_ec2.py fills in the three values below.
#   BUCKET: S3 bucket holding code.tar.gz and data/{hex,cells,analog}      SITE: the HTTPS host name      REGION: the bucket's region
set -euxo pipefail
exec > >(tee /var/log/firecalendar-bootstrap.log) 2>&1
BUCKET="__BUCKET__"; SITE="__SITE__"; REGION="__REGION__"

apt-get update -y
apt-get install -y docker.io docker-compose-v2 unzip curl
systemctl enable --now docker
if ! command -v aws >/dev/null; then
  curl -fsSL "https://awscli.amazonaws.com/awscli-exe-linux-x86_64.zip" -o /tmp/awscli.zip
  unzip -q /tmp/awscli.zip -d /tmp && /tmp/aws/install
fi
export AWS_DEFAULT_REGION="$REGION"

mkdir -p /srv/firecalendar/data /srv/firecalendar/app
aws s3 cp "s3://$BUCKET/code.tar.gz" /tmp/code.tar.gz
tar -xzf /tmp/code.tar.gz -C /srv/firecalendar/app
aws s3 sync "s3://$BUCKET/data/hex" /srv/firecalendar/data/hex --only-show-errors
aws s3 sync "s3://$BUCKET/data/cells" /srv/firecalendar/data/cells --only-show-errors
aws s3 sync "s3://$BUCKET/data/analog" /srv/firecalendar/data --only-show-errors   # analog_weekly.parquet + analog_meta.json at the top level

cd /srv/firecalendar/app/deploy
SITE_ADDRESS="$SITE" docker compose -f docker-compose.prod.yml up -d --build
echo "FireCalendar is starting at https://$SITE"
