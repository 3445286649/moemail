CREATE TABLE IF NOT EXISTS `otp_user_state` (
  `user_id` text PRIMARY KEY NOT NULL,
  `version` integer DEFAULT 0 NOT NULL,
  `total` integer DEFAULT 0 NOT NULL,
  `message_count` integer DEFAULT 0 NOT NULL,
  `code_count` integer DEFAULT 0 NOT NULL,
  `received_count` integer DEFAULT 0 NOT NULL,
  `empty_count` integer DEFAULT 0 NOT NULL,
  `used_count` integer DEFAULT 0 NOT NULL,
  `latest_received_at` integer,
  `updated_at` integer DEFAULT 0 NOT NULL,
  FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `otp_user_state_version_idx` ON `otp_user_state` (`version`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `email_user_expires_updated_idx` ON `email` (`userId`,`expires_at`,`updated_at`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `email_user_activity_idx` ON `email` (`userId`,COALESCE(`latest_received_at`, `created_at`),`id`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `email_user_batch_idx` ON `email` (`userId`,`batch_id`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `email_user_used_idx` ON `email` (`userId`,`used`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `email_user_address_lower_idx` ON `email` (`userId`,LOWER(`address`));
--> statement-breakpoint
INSERT OR REPLACE INTO `otp_user_state` (
  `user_id`,
  `version`,
  `total`,
  `message_count`,
  `code_count`,
  `received_count`,
  `empty_count`,
  `used_count`,
  `latest_received_at`,
  `updated_at`
)
SELECT
  `userId`,
  COALESCE(MAX(COALESCE(`updated_at`, `latest_received_at`, `created_at`, 0)), 0),
  COUNT(*),
  COALESCE(SUM(COALESCE(`message_count`, 0)), 0),
  COALESCE(SUM(CASE WHEN `latest_code` IS NOT NULL AND `latest_code` != '' THEN 1 ELSE 0 END), 0),
  COALESCE(SUM(CASE WHEN `latest_received_at` IS NOT NULL THEN 1 ELSE 0 END), 0),
  COALESCE(SUM(CASE WHEN COALESCE(`message_count`, 0) = 0 THEN 1 ELSE 0 END), 0),
  COALESCE(SUM(CASE WHEN COALESCE(`used`, 0) = 1 THEN 1 ELSE 0 END), 0),
  MAX(`latest_received_at`),
  COALESCE(MAX(COALESCE(`updated_at`, `latest_received_at`, `created_at`, 0)), 0)
FROM `email`
WHERE `userId` IS NOT NULL
  AND `expires_at` > CAST(strftime('%s', 'now') AS integer) * 1000
GROUP BY `userId`;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS `email_otp_state_insert`
AFTER INSERT ON `email`
WHEN NEW.`userId` IS NOT NULL
BEGIN
  INSERT INTO `otp_user_state` (
    `user_id`,
    `version`,
    `total`,
    `message_count`,
    `code_count`,
    `received_count`,
    `empty_count`,
    `used_count`,
    `latest_received_at`,
    `updated_at`
  )
  VALUES (
    NEW.`userId`,
    COALESCE(NEW.`updated_at`, NEW.`latest_received_at`, NEW.`created_at`, CAST(strftime('%s', 'now') AS integer) * 1000),
    1,
    COALESCE(NEW.`message_count`, 0),
    CASE WHEN NEW.`latest_code` IS NOT NULL AND NEW.`latest_code` != '' THEN 1 ELSE 0 END,
    CASE WHEN NEW.`latest_received_at` IS NOT NULL THEN 1 ELSE 0 END,
    CASE WHEN COALESCE(NEW.`message_count`, 0) = 0 THEN 1 ELSE 0 END,
    CASE WHEN COALESCE(NEW.`used`, 0) = 1 THEN 1 ELSE 0 END,
    NEW.`latest_received_at`,
    COALESCE(NEW.`updated_at`, NEW.`latest_received_at`, NEW.`created_at`, CAST(strftime('%s', 'now') AS integer) * 1000)
  )
  ON CONFLICT(`user_id`) DO UPDATE SET
    `version` = MAX(`otp_user_state`.`version`, excluded.`version`, CAST(strftime('%s', 'now') AS integer) * 1000),
    `total` = `otp_user_state`.`total` + 1,
    `message_count` = `otp_user_state`.`message_count` + excluded.`message_count`,
    `code_count` = `otp_user_state`.`code_count` + excluded.`code_count`,
    `received_count` = `otp_user_state`.`received_count` + excluded.`received_count`,
    `empty_count` = `otp_user_state`.`empty_count` + excluded.`empty_count`,
    `used_count` = `otp_user_state`.`used_count` + excluded.`used_count`,
    `latest_received_at` = MAX(COALESCE(`otp_user_state`.`latest_received_at`, 0), COALESCE(excluded.`latest_received_at`, 0)),
    `updated_at` = excluded.`updated_at`;
END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS `email_otp_state_update`
AFTER UPDATE ON `email`
WHEN NEW.`userId` IS NOT NULL AND NEW.`userId` = OLD.`userId`
BEGIN
  INSERT INTO `otp_user_state` (
    `user_id`,
    `version`,
    `total`,
    `message_count`,
    `code_count`,
    `received_count`,
    `empty_count`,
    `used_count`,
    `latest_received_at`,
    `updated_at`
  )
  VALUES (
    NEW.`userId`,
    COALESCE(NEW.`updated_at`, NEW.`latest_received_at`, NEW.`created_at`, CAST(strftime('%s', 'now') AS integer) * 1000),
    1,
    COALESCE(NEW.`message_count`, 0),
    CASE WHEN NEW.`latest_code` IS NOT NULL AND NEW.`latest_code` != '' THEN 1 ELSE 0 END,
    CASE WHEN NEW.`latest_received_at` IS NOT NULL THEN 1 ELSE 0 END,
    CASE WHEN COALESCE(NEW.`message_count`, 0) = 0 THEN 1 ELSE 0 END,
    CASE WHEN COALESCE(NEW.`used`, 0) = 1 THEN 1 ELSE 0 END,
    NEW.`latest_received_at`,
    COALESCE(NEW.`updated_at`, NEW.`latest_received_at`, NEW.`created_at`, CAST(strftime('%s', 'now') AS integer) * 1000)
  )
  ON CONFLICT(`user_id`) DO UPDATE SET
    `version` = MAX(`otp_user_state`.`version`, excluded.`version`, CAST(strftime('%s', 'now') AS integer) * 1000),
    `message_count` = MAX(0, `otp_user_state`.`message_count` + COALESCE(NEW.`message_count`, 0) - COALESCE(OLD.`message_count`, 0)),
    `code_count` = MAX(0, `otp_user_state`.`code_count` + (CASE WHEN NEW.`latest_code` IS NOT NULL AND NEW.`latest_code` != '' THEN 1 ELSE 0 END) - (CASE WHEN OLD.`latest_code` IS NOT NULL AND OLD.`latest_code` != '' THEN 1 ELSE 0 END)),
    `received_count` = MAX(0, `otp_user_state`.`received_count` + (CASE WHEN NEW.`latest_received_at` IS NOT NULL THEN 1 ELSE 0 END) - (CASE WHEN OLD.`latest_received_at` IS NOT NULL THEN 1 ELSE 0 END)),
    `empty_count` = MAX(0, `otp_user_state`.`empty_count` + (CASE WHEN COALESCE(NEW.`message_count`, 0) = 0 THEN 1 ELSE 0 END) - (CASE WHEN COALESCE(OLD.`message_count`, 0) = 0 THEN 1 ELSE 0 END)),
    `used_count` = MAX(0, `otp_user_state`.`used_count` + (CASE WHEN COALESCE(NEW.`used`, 0) = 1 THEN 1 ELSE 0 END) - (CASE WHEN COALESCE(OLD.`used`, 0) = 1 THEN 1 ELSE 0 END)),
    `latest_received_at` = (
      SELECT MAX(`latest_received_at`)
      FROM `email`
      WHERE `userId` = NEW.`userId`
        AND `expires_at` > CAST(strftime('%s', 'now') AS integer) * 1000
    ),
    `updated_at` = excluded.`updated_at`;
END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS `email_otp_state_delete`
AFTER DELETE ON `email`
WHEN OLD.`userId` IS NOT NULL
BEGIN
  UPDATE `otp_user_state`
  SET
    `version` = MAX(`version`, CAST(strftime('%s', 'now') AS integer) * 1000),
    `total` = MAX(0, `total` - 1),
    `message_count` = MAX(0, `message_count` - COALESCE(OLD.`message_count`, 0)),
    `code_count` = MAX(0, `code_count` - CASE WHEN OLD.`latest_code` IS NOT NULL AND OLD.`latest_code` != '' THEN 1 ELSE 0 END),
    `received_count` = MAX(0, `received_count` - CASE WHEN OLD.`latest_received_at` IS NOT NULL THEN 1 ELSE 0 END),
    `empty_count` = MAX(0, `empty_count` - CASE WHEN COALESCE(OLD.`message_count`, 0) = 0 THEN 1 ELSE 0 END),
    `used_count` = MAX(0, `used_count` - CASE WHEN COALESCE(OLD.`used`, 0) = 1 THEN 1 ELSE 0 END),
    `latest_received_at` = (
      SELECT MAX(`latest_received_at`)
      FROM `email`
      WHERE `userId` = OLD.`userId`
        AND `expires_at` > CAST(strftime('%s', 'now') AS integer) * 1000
    ),
    `updated_at` = CAST(strftime('%s', 'now') AS integer) * 1000
  WHERE `user_id` = OLD.`userId`;
END;
