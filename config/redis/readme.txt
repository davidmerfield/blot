Redis orchestration tools
=========================

This directory now contains scripts to provision a replacement Redis
instance from S3 backups, verify it against the production database, and
clean up instances once they are no longer required. The tooling is
intended for operators who already have SSH access to the Blot
infrastructure and an AWS profile with the minimal permissions described
below.

Prerequisites
-------------

* AWS CLI v2 configured with a profile that can interact with the Blot
  AWS account.
* SSH access to the Redis launch template (private key on disk) and to
  the primary Blot host via the `ssh blot` alias.
* The scripts rely only on core system utilities (`bash`, `ssh`, `scp`,
  `python3`) and do not require additional packages.

Minimal IAM policy snippets
---------------------------

Use a dedicated profile that is limited to the following actions. Adjust
resource ARNs if the bucket name or region ever changes.

```
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "RedisBackupListing",
      "Effect": "Allow",
      "Action": [
        "s3:ListBucket"
      ],
      "Resource": "arn:aws:s3:::blot-redis-backups",
      "Condition": {
        "StringLike": {
          "s3:prefix": [
            "daily/*"
          ]
        }
      }
    },
    {
      "Sid": "RedisProvisioning",
      "Effect": "Allow",
      "Action": [
        "ec2:RunInstances",
        "ec2:DescribeInstances",
        "ec2:DescribeInstanceStatus",
        "ec2:CreateTags",
        "ec2:ModifyInstanceAttribute",
        "ec2:StopInstances",
        "ec2:TerminateInstances"
      ],
      "Resource": "*"
    }
  ]
}
```

Provisioning and restore workflow
---------------------------------

Run `config/redis/scripts/provision-and-restore.sh` from the repository
root.

1. The script lists recent snapshots from
   `s3://blot-redis-backups/daily`. Choose the desired backup when
   prompted.
2. Provide the path to the Redis instance SSH key (or export
   `REDIS_SSH_KEY`). The tool launches a new instance using launch
   template `lt-09f38dac82c204d58` in `us-west-2`, ensuring security
   group `sg-0b3b200323d36ce2e` is attached. Metadata tags include
   `RedisProvisionedBy=redis-restore-script`, the snapshot name, and an
   ISO8601 timestamp. Details are appended to
   `config/redis/scripts/provisioned-instances.log` for later review.
3. Once AWS reports the instance is running, the script waits for SSH and
   invokes `config/redis/transfer.sh` to copy helper scripts to the
   server. If the instance profile does not provide S3 access you can
   supply temporary AWS credentials when prompted so the remote restore
   succeeds.
4. The chosen snapshot is restored by running
   `restore-from-backup.sh` on the new instance. Afterwards the script
   compares the restored Redis dataset against the production database by
   executing `redis-cli` on the main Blot host (`ssh blot`). DB size,
   keyspace information, and ping results are displayed side-by-side.
5. If the operator confirms that the data looks correct, the script
   updates `BLOT_REDIS_HOST` in `/etc/blot/secrets.env`, restarts all
   Docker containers (`docker restart blot-container-*`), and reloads
   OpenResty (`sudo openresty -t && sudo openresty -s reload`). If not,
   no configuration is changed.
6. Use `--dry-run` to preview AWS API calls and SSH steps without creating
   resources.

Cleanup workflow
----------------

Use `config/redis/scripts/cleanup-provisioned.sh` to find and decommission
instances that were created by the provisioning script.

1. The script queries AWS for EC2 instances tagged with
   `RedisProvisionedBy=redis-restore-script` and prints their state, launch
   time, and private IP. Cross-reference with
   `config/redis/scripts/provisioned-instances.log` if additional context
   is needed.
2. Select an instance and choose whether to stop or terminate it. A
   default of terminate is suggested for stopped instances.
3. Confirm the action. When run with `--dry-run` the AWS command is
   printed but not executed.

Safety features
---------------

* Both scripts use `set -euo pipefail`, consistent error handling, and
  explicit confirmation prompts before making irreversible changes.
* Provisioning waits for SSH availability, verifies Redis connectivity
  with `redis-cli`, and skips environment changes if validation fails.
* Cleanup refuses to stop an already stopped instance and always
  requests operator confirmation.
* Logs are kept in `config/redis/scripts/provisioned-instances.log` to aid
  later cleanup or auditing.
