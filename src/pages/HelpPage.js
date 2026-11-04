import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import PrivacyContent from '../components/PrivacyContent';
import { Button, Container } from 'react-bootstrap';
import { HELP_NAV, HELP_SECTIONS } from '../helpContent';
import { helpSectionIdFromLink, scrollToHelpSection } from '../helpNavigation';
import { useDocumentTitle } from '../pageTitle';

export default function HelpPage(props) {
  useDocumentTitle('Help');
  var location = useLocation();
  var loginButton = props.tunebook && props.tunebook.icons
    ? <Button variant="success">{props.tunebook.icons.login}</Button>
    : null;

  useEffect(function() {
    var sectionId = helpSectionIdFromLink(location.hash || '');
    if (!sectionId) return;
    var timer = window.setTimeout(function() {
      scrollToHelpSection(sectionId);
    }, 50);
    return function() {
      window.clearTimeout(timer);
    };
  }, [location.hash, location.pathname]);

  return (
    <div className="App-print help-page">
      <header className="help-hero">
        <h1>ABC Tune Book — Help</h1>
        <p className="help-lead">
          Collect tunes, organise them into books, practise with notation and linked media, and optionally sync your collection through Google Drive.
        </p>
        <nav className="help-quick-links" aria-label="Quick links">
          {HELP_NAV.slice(0, 6).map(function(item) {
            return (
              <button
                key={item.id}
                type="button"
                className="help-quick-link"
                onClick={function() { scrollToHelpSection(item.id); }}
              >
                {item.title}
              </button>
            );
          })}
        </nav>
      </header>

      <div className="help-layout">
        <nav className="help-section-nav" aria-label="Help sections">
          <ul>
            {HELP_NAV.map(function(item) {
              return (
                <li key={item.id}>
                  <button type="button" onClick={function() { scrollToHelpSection(item.id); }}>
                    {item.title}
                  </button>
                </li>
              );
            })}
          </ul>
        </nav>

        <main className="help-main">
          {HELP_SECTIONS.map(function(section) {
            var Content = section.Content;
            return (
              <section key={section.id} id={section.id} className="help-section">
                <h2>{section.title}</h2>
                <div className="help-section-body">
                  {section.id === 'offline-sync'
                    ? <Content loginButton={loginButton} />
                    : <Content />}
                </div>
              </section>
            );
          })}

          <section id="privacy" className="help-section help-section-privacy">
            <h2>Privacy and terms</h2>
            <div className="help-section-body">
              <PrivacyContent />
            </div>
          </section>
        </main>
      </div>

      <footer className="help-footer">
        <hr />
        <Container className="help-footer-inner">
          <div className="help-footer-contact">
            <span>(CopyLeft 2022) Steve Ryan <a href="mailto:syntithenai@gmail.com">syntithenai@gmail.com</a></span>
          </div>
          <div className="help-footer-row">
            <span>Source code on <a href="https://github.com/syntithenai/abc2book">Github</a></span>
          </div>
          <a className="help-footer-issues" target="_new" rel="noreferrer" href="https://github.com/syntithenai/abc2book/issues">
            <button type="button">Problems or suggestions ?</button>
          </a>
        </Container>
      </footer>
    </div>
  );
}
