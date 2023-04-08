import React, { useState } from "react";
import { Form } from "react-bootstrap";

const speedOptions = [
  { value: 0.25, label: "0.25x" },
  { value: 0.5, label: "0.5x" },
  { value: 0.75, label: "0.75x" },
  { value: 1, label: "Normal" },
  { value: 1.25, label: "1.25x" },
  { value: 1.5, label: "1.5x" },
  { value: 1.75, label: "1.75x" },
  { value: 2, label: "2x" },
];

const PlaybackSpeedSelector = ({onChange, value, mediaController}) => {
  const [selectedSpeed, setSelectedSpeed] = useState(value);

  const handleSpeedChange = (e) => {
    setSelectedSpeed(e.target.value);
    if (mediaController && mediaController.playerRef && mediaController.playerRef.current) {
        console.log('immediate set audio rate', e.target.value, mediaController.playerRef)
        mediaController.playerRef.current.playbackRate = parseFloat(e.target.value)
        //document.getElementByName('audio').playbackRate = e.target.value
    }
    if (mediaController && mediaController.ytPlayerRef && mediaController.ytPlayerRef.current) {
        console.log('immediate set YT rate', e.target.value)
        try {
            mediaController.ytPlayerRef.current.setPlaybackRate(parseFloat(e.target.value))
        } catch (e) {}
    }
    if (onChange) onChange(e.target.value)
    
  };

  return (
    <Form.Group controlId="playbackSpeedSelect">
      <Form.Label>Playback Speed</Form.Label>
      <Form.Control
        as="select"
        value={selectedSpeed}
        onChange={handleSpeedChange}
      >
        {speedOptions.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </Form.Control>
    </Form.Group>
  );
};

export default PlaybackSpeedSelector;
