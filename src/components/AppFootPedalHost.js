import useAppFootPedalBindings from '../useAppFootPedalBindings';

export default function AppFootPedalHost(props) {
  useAppFootPedalBindings({
    tunebook: props.tunebook,
    mediaController: props.mediaController,
    nowPlayingQueue: props.nowPlayingQueue,
  });
  return null;
}
