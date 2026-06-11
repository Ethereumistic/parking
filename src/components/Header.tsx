import { Link } from '@tanstack/react-router'

export default function Header() {
  return (
    <header className="sticky top-0 z-50 border-b border-white/10 bg-[rgba(28,29,34,.78)] px-4 backdrop-blur-xl">
      <nav className="mx-auto flex max-w-6xl items-center justify-between py-3">
        <Link to="/" search={{ mode: 'regular', arr_date: '', dep_date: '', arr_time: '10:00', dep_time: '10:00' }} className="inline-flex items-center gap-2 text-sm font-black text-white no-underline">
          <span className="text-xl">🅿️</span> Parking Smokinya
        </Link>
        <Link to="/" search={{ mode: 'regular', arr_date: '', dep_date: '', arr_time: '10:00', dep_time: '10:00' }} className="text-sm text-white/65 no-underline hover:text-white">Калкулатор</Link>
      </nav>
    </header>
  )
}
