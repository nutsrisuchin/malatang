// db.js — the only file that talks to Firebase directly.
// Everything else (app.js) goes through the DB object below.

firebase.initializeApp(firebaseConfig);
const authInstance = firebase.auth();
const firestore = firebase.firestore();

function slugify(name) {
  return String(name)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9ก-๙]+/gi, "")
    .replace(/\s+/g, "");
}

function nameToEmail(name) {
  return `${slugify(name)}@${AUTH_DOMAIN}`;
}

const DB = {
  OWNER_EMAIL,

  // ---------- Auth ----------

  onAuthStateChanged(cb) {
    return authInstance.onAuthStateChanged(cb);
  },

  currentUser() {
    return authInstance.currentUser;
  },

  async loginWithNamePin(name, pin) {
    const email = name.trim().toLowerCase() === "owner" ? OWNER_EMAIL : nameToEmail(name);
    return authInstance.signInWithEmailAndPassword(email, pin);
  },

  async logout() {
    return authInstance.signOut();
  },

  async changeOwnPin(newPin) {
    const user = authInstance.currentUser;
    if (!user) throw new Error("ยังไม่ได้เข้าสู่ระบบ");
    return user.updatePassword(newPin);
  },

  // Creates a brand-new staff login without disturbing the admin's own
  // session: spins up a second, throwaway Firebase app connection just
  // long enough to create the account, then tears it down.
  async createStaffAuthAccount(name, pin) {
    const email = nameToEmail(name);
    const secondaryAppName = `secondary-${Date.now()}`;
    const secondaryApp = firebase.initializeApp(firebaseConfig, secondaryAppName);
    try {
      const secondaryAuth = secondaryApp.auth();
      const cred = await secondaryAuth.createUserWithEmailAndPassword(email, pin);
      await secondaryAuth.signOut();
      return { uid: cred.user.uid, email };
    } finally {
      await secondaryApp.delete();
    }
  },

  // ---------- Firestore: generic helpers ----------

  serverTimestamp() {
    return firebase.firestore.FieldValue.serverTimestamp();
  },

  increment(n) {
    return firebase.firestore.FieldValue.increment(n);
  },

  // options: { orderByField, orderDirection ("asc"/"desc", default "desc"), limit }
  // Passing a limit caps both the initial read and the live-sync window to
  // that many docs (most-recent-first when orderByField is given) instead
  // of the whole collection, which matters for collections that only grow.
  subscribeCollection(collectionName, onData, options = {}) {
    let ref = firestore.collection(collectionName);
    if (options.orderByField) ref = ref.orderBy(options.orderByField, options.orderDirection || "desc");
    if (options.limit) ref = ref.limit(options.limit);
    return ref.onSnapshot(
      (snap) => {
        const items = [];
        snap.forEach((doc) => items.push({ id: doc.id, ...doc.data() }));
        onData(items);
      },
      (err) => console.error(`[DB] subscribe(${collectionName}) failed:`, err)
    );
  },

  async addDoc(collectionName, data) {
    const ref = await firestore.collection(collectionName).add(data);
    return ref.id;
  },

  async setDoc(collectionName, id, data, merge = true) {
    await firestore.collection(collectionName).doc(id).set(data, { merge });
  },

  async updateDoc(collectionName, id, data) {
    await firestore.collection(collectionName).doc(id).update(data);
  },

  async deleteDoc(collectionName, id) {
    await firestore.collection(collectionName).doc(id).delete();
  },

  async getDoc(collectionName, id) {
    const doc = await firestore.collection(collectionName).doc(id).get();
    return doc.exists ? { id: doc.id, ...doc.data() } : null;
  },
};
