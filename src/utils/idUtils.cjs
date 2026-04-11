const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const ID_CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
const ID_LENGTH = 12;

function getSettingsFile() {
  const { app } = require("electron");
  return path.join(app.getPath("userData"), "profile.json");
}

function generateId(length = ID_LENGTH) {
  let id = "";
  const bytes = crypto.randomBytes(length);
  for (let i = 0; i < length; i++) {
    id += ID_CHARS[bytes[i] % ID_CHARS.length];
  }
  return id;
}

function validateIdFormat(id) {
  if (typeof id !== "string") return false;
  if (id.length !== ID_LENGTH) return false;
  const validRegex = new RegExp(`^[${ID_CHARS}]+$`);
  return validRegex.test(id);
}

function validateId(id) {
  if (!validateIdFormat(id)) return false;
  try {
    const profilePath = getSettingsFile();
    if (!fs.existsSync(profilePath)) return false;
    const parsed = JSON.parse(fs.readFileSync(profilePath, "utf8"));
    return parsed.id === id;
  } catch {
    return false;
  }
}

module.exports = {
  generateId,
  validateIdFormat,
  validateId,
  ID_CHARS,
  ID_LENGTH,
};
