import { useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { getAppPathname } from './playbackNavigationUtils';
import { updateFootPedalController } from './footPedalController';
import './footPedalController';

export default function useAppFootPedalBindings(options) {
  const location = useLocation();
  const navigate = useNavigate();
  const tunebook = options.tunebook;
  const mediaController = options.mediaController;
  const nowPlayingQueue = options.nowPlayingQueue;

  useEffect(function() {
    updateFootPedalController({
      tunebook: tunebook,
      navigate: navigate,
      mediaController: mediaController,
      nowPlayingQueue: nowPlayingQueue,
      getPathname: function() {
        return location.pathname || getAppPathname();
      },
    });
  }, [
    tunebook,
    navigate,
    mediaController,
    nowPlayingQueue,
    location.pathname,
  ]);
}
