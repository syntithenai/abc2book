import {Link, useLocation} from 'react-router-dom'
import {Button} from 'react-bootstrap'

export default function Footer(props) {
    var location = useLocation()
    if (location.pathname.startsWith('/print') || location.pathname.startsWith('/cheatsheet')) return null

    return (
      <div id="footer">
        <div className="footer-inner">
          <div className="footer-actions">
            {props.accessToken
              ? <Button size="sm" variant="danger" onClick={function() { props.logout() }}>Logout</Button>
              : <Button size="sm" variant="success" onClick={function() { props.login() }}>Login</Button>}
            <Link to="/sets">
              <Button size="sm" variant="outline-primary">Sets</Button>
            </Link>
            <Link to="/settings">
              <Button size="sm" variant="outline-primary">{props.tunebook.icons.settings} Settings</Button>
            </Link>
            <Link to="/help" onClick={function() { setTimeout(function() { props.tunebook.utils.scrollTo('topofpage') }, 300) }}>
              <Button size="sm" variant="outline-primary">{props.tunebook.icons.question} Help</Button>
            </Link>
          </div>
          <div className="footer-meta">
            The Tune Book is{' '}
            <a target="_new" rel="noreferrer" href="https://github.com/syntithenai/abc2book/">
              open source software
            </a>
          </div>
        </div>
      </div>
    )
}
