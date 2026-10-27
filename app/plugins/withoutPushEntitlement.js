// Free Apple "Personal Team" accounts can't sign apps with the Push
// Notifications capability, which expo-notifications adds by default. Mika
// only uses local notifications (reminders, alarm fallback), so drop it.
// Remove this plugin if you add remote push with a paid developer account.
const { withEntitlementsPlist } = require("expo/config-plugins");

module.exports = function withoutPushEntitlement(config) {
  return withEntitlementsPlist(config, (cfg) => {
    delete cfg.modResults["aps-environment"];
    return cfg;
  });
};
