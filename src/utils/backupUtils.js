/**
 * Helper function to get next backup schedule
 */
export const getNextBackupDate = (config) => {
  const now = new Date();
  let nextDate = new Date(now);

  const [hours, minutes] = config.backupTime.split(":").map(Number);
  nextDate.setHours(hours, minutes, 0, 0);

  if (config.backupFrequency === "daily") {
    if (nextDate <= now) {
      nextDate.setDate(nextDate.getDate() + 1);
    }
  } else if (config.backupFrequency === "weekly") {
    const dayMap = {
      Monday: 1,
      Tuesday: 2,
      Wednesday: 3,
      Thursday: 4,
      Friday: 5,
      Saturday: 6,
      Sunday: 0,
    };
    const targetDay = dayMap[config.backupDay];
    const currentDay = nextDate.getDay();

    const daysUntilTarget =
      (targetDay - currentDay + 7) % 7 || (nextDate <= now ? 7 : 0);
    nextDate.setDate(nextDate.getDate() + daysUntilTarget);
  } else if (config.backupFrequency === "monthly") {
    nextDate.setMonth(nextDate.getMonth() + 1);
    nextDate.setDate(1);
  }

  return nextDate;
};
