import { initializeApp } from 'firebase/app'
import { getDatabase } from 'firebase/database'

const firebaseConfig = {
  apiKey: 'AIzaSyBghDQYhpnLcXzzKsG8MtKHEre_wUaIYJM',
  authDomain: 'lapose-d2a83.firebaseapp.com',
  databaseURL: 'https://lapose-d2a83-default-rtdb.europe-west1.firebasedatabase.app',
  projectId: 'lapose-d2a83',
  storageBucket: 'lapose-d2a83.firebasestorage.app',
  messagingSenderId: '633119883215',
  appId: '1:633119883215:web:9edb546bdd7ee505919cba',
  measurementId: 'G-XBH8CV4L5Y',
}

export const firebaseApp = initializeApp(firebaseConfig)
export const db = getDatabase(firebaseApp)

