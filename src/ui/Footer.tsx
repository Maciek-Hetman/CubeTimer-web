import { Link } from 'react-router-dom'

export function Footer() {
  const year = new Date().getFullYear()
  return (
    <footer className="app-footer">
      <span>&copy; {year} Maciej Hetman</span>
      <Link to="/about">About</Link>
      <Link to="/privacy">Privacy</Link>
      <Link to="/release-notes">Release notes</Link>
      <a href="https://github.com/Maciek-Hetman/CubeTimer-web" target="_blank" rel="noreferrer">
        GitHub
      </a>
    </footer>
  )
}
