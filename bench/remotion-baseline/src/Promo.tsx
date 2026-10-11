import {
  AbsoluteFill,
  Easing,
  Sequence,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from 'remotion';

const FONT = '"DejaVu Sans", sans-serif';

const Texts: React.FC = () => {
  const frame = useCurrentFrame();
  const {fps, durationInFrames} = useVideoConfig();
  const clamp = {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'} as const;

  const fadeOut = interpolate(frame, [5.4 * fps, durationInFrames], [1, 0], clamp);
  const titleIn = interpolate(frame, [0.2 * fps, 0.8 * fps], [0, 1], {
    ...clamp,
    easing: Easing.out(Easing.cubic),
  });
  const subIn = interpolate(frame, [0.8 * fps, 1.3 * fps], [0, 1], clamp);

  const line = (cy: number): React.CSSProperties => ({
    position: 'absolute',
    left: 0,
    width: '100%',
    top: cy - 60,
    height: 120,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontFamily: FONT,
  });

  return (
    <>
      <div
        style={{
          ...line(300),
          color: 'white',
          fontSize: 96,
          fontWeight: 'bold',
          opacity: titleIn * fadeOut,
          transform: `translateY(${(1 - titleIn) * 40}px)`,
        }}
      >
        Hello, Frameflow
      </div>
      <div
        style={{
          ...line(390),
          color: '#94a3b8',
          fontSize: 48,
          fontWeight: 'normal',
          opacity: subIn * fadeOut,
        }}
      >
        Video as code, made simple
      </div>
    </>
  );
};

const Circle: React.FC<{x: number; color: string; delay: number}> = ({x, color, delay}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const scale = spring({frame: frame - delay, fps, config: {damping: 12}});
  return (
    <div
      style={{
        position: 'absolute',
        left: x - 40,
        top: 540 - 40,
        width: 80,
        height: 80,
        borderRadius: '50%',
        background: color,
        transform: `scale(${scale})`,
      }}
    />
  );
};

export const Promo: React.FC = () => {
  const frame = useCurrentFrame();
  const {fps, width, durationInFrames} = useVideoConfig();
  const progress = interpolate(frame, [0, durationInFrames], [0, width], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  return (
    <AbsoluteFill style={{backgroundColor: '#0f172a'}}>
      <Texts />
      <Sequence from={Math.round(1.5 * fps)} layout="none">
        <Circle x={440} color="#f43f5e" delay={0} />
      </Sequence>
      <Sequence from={Math.round(1.65 * fps)} layout="none">
        <Circle x={640} color="#22c55e" delay={0} />
      </Sequence>
      <Sequence from={Math.round(1.8 * fps)} layout="none">
        <Circle x={840} color="#3b82f6" delay={0} />
      </Sequence>
      <div
        style={{
          position: 'absolute',
          left: 0,
          top: 704,
          height: 16,
          width: progress,
          background: '#38bdf8',
        }}
      />
    </AbsoluteFill>
  );
};
