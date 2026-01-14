// Утилиты для работы с хранилищем (абстракция над localStorage/sessionStorage)

export function getItem(key, storage = localStorage) {
  try {
    return storage.getItem(key);
  } catch (e) {
    console.warn(`Failed to get item from storage: ${key}`, e);
    return null;
  }
}

export function setItem(key, value, storage = localStorage) {
  try {
    storage.setItem(key, value);
    return true;
  } catch (e) {
    console.warn(`Failed to set item in storage: ${key}`, e);
    return false;
  }
}

export function removeItem(key, storage = localStorage) {
  try {
    storage.removeItem(key);
    return true;
  } catch (e) {
    console.warn(`Failed to remove item from storage: ${key}`, e);
    return false;
  }
}
