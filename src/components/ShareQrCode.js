import { Component } from 'react'
import { QRCodeSVG } from 'qrcode.react'
import { qrSafeShareLink } from '../playlistPublicShare'

/**
 * Renders a QR code for a share link, or a short fallback when the payload
 * exceeds QR capacity (avoids qrcode.react "Data too long" crashes).
 */
export default class ShareQrCode extends Component {
  constructor(props) {
    super(props)
    this.state = { failed: false, lastValue: '' }
  }

  static getDerivedStateFromError() {
    return { failed: true }
  }

  componentDidCatch() {
    // Swallow — fallback UI is enough.
  }

  componentDidUpdate(prevProps) {
    const nextValue = this.props.value || ''
    if (nextValue !== prevProps.value && this.state.failed) {
      this.setState({ failed: false, lastValue: nextValue })
    }
  }

  render() {
    const {
      value,
      size = 220,
      level = 'L',
      includeMargin = true,
      className,
      fallbackClassName,
    } = this.props
    const qrValue = qrSafeShareLink(value)
    if (!qrValue || this.state.failed) {
      return (
        <p
          className={fallbackClassName || 'text-muted small mb-0 px-3'}
          data-testid="share-qr-too-long"
        >
          This link is too long for a QR code. Copy or email the link instead.
        </p>
      )
    }
    return (
      <div className={className} data-testid="share-qr-code">
        <QRCodeSVG
          value={qrValue}
          size={size}
          level={level}
          includeMargin={includeMargin}
        />
      </div>
    )
  }
}
