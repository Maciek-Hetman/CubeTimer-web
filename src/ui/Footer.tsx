export function Footer() {
  const year = new Date().getFullYear()
  return (
    <footer className="app-footer">
      <span>&copy; {year} Maciej Hetman</span>
      <a href="https://github.com/Maciek-Hetman/CubeTimer-web" target="_blank" rel="noreferrer">
        GitHub
      </a>
    </footer>
  )
}
