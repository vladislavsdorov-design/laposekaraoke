import './App.css'
import { Route, Routes } from 'react-router-dom'
import AdminDj from './pages/AdminDj'
import Announcer from './pages/Announcer'
import Home from './pages/Home'
import NotFound from './pages/NotFound'

function App() {
  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/admindjvl" element={<AdminDj />} />
      <Route path="/dwaczelJG" element={<Announcer />} />
      <Route path="*" element={<NotFound />} />
    </Routes>
  )
}

export default App
