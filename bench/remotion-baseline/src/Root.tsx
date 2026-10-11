import {Composition} from 'remotion';
import {Promo} from './Promo';

export const RemotionRoot: React.FC = () => (
  <Composition
    id="Promo"
    component={Promo}
    width={1280}
    height={720}
    fps={30}
    durationInFrames={180}
  />
);
