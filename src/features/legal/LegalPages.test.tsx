/** @vitest-environment jsdom */
import '@testing-library/jest-dom/vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it } from 'vitest'
import { Footer } from '../../ui/Footer'
import { AboutPage } from './AboutPage'
import { PrivacyPage } from './PrivacyPage'
import { ReleaseNotesPage } from './ReleaseNotesPage'
import { RELEASES } from './releaseNotes'

describe('legal pages', () => {
  afterEach(cleanup)

  it('renders About and links to the privacy policy', () => {
    render(
      <MemoryRouter>
        <AboutPage />
      </MemoryRouter>,
    )
    expect(screen.getByRole('heading', { name: 'About' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'privacy policy' })).toHaveAttribute('href', '/privacy')
  })

  it('renders the privacy policy', () => {
    render(
      <MemoryRouter>
        <PrivacyPage />
      </MemoryRouter>,
    )
    expect(screen.getByRole('heading', { name: 'Privacy policy' })).toBeInTheDocument()
  })

  it('lists releases and marks the one being used', () => {
    render(
      <ReleaseNotesPage
        currentVersion="v0.2.0"
        releases={[
          { version: 'v0.2.0', date: '2026-09-18', changes: ['Bluetooth timers'] },
          { version: 'v0.1', date: '2026-09-01', changes: ['First release'] },
        ]}
      />,
    )
    expect(screen.getByRole('heading', { name: 'Release notes' })).toBeInTheDocument()
    expect(screen.getByText("You're using v0.2.0.")).toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'v0.2.0' })).toHaveTextContent('Current')
    expect(screen.getByRole('region', { name: 'v0.1' })).not.toHaveTextContent('Current')
    expect(screen.getByText('First release')).toBeInTheDocument()
  })

  it('keeps release notes newest first with unique versions', () => {
    const dates = RELEASES.map((release) => release.date)
    expect([...dates].sort().reverse()).toEqual(dates)
    expect(new Set(RELEASES.map((release) => release.version)).size).toBe(RELEASES.length)
    for (const release of RELEASES) {
      expect(release.version).toMatch(/^v\d+\.\d+(\.\d+)?$/)
      expect(release.changes.length).toBeGreaterThan(0)
    }
  })

  it('links to all pages from the footer', () => {
    render(
      <MemoryRouter>
        <Footer />
      </MemoryRouter>,
    )
    expect(screen.getByRole('link', { name: 'About' })).toHaveAttribute('href', '/about')
    expect(screen.getByRole('link', { name: 'Privacy' })).toHaveAttribute('href', '/privacy')
    expect(screen.getByRole('link', { name: 'Release notes' })).toHaveAttribute('href', '/release-notes')
  })
})
