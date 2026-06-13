export function Avatar({ name, size = 22 }: { name: string; size?: number }) {
  const initials = name
    .split(" ")
    .map((word) => word[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
  const hue = [...name].reduce((sum, char) => sum + char.charCodeAt(0), 0) % 360;

  return (
    <div
      className="author-avatar"
      style={{
        width: size,
        height: size,
        borderRadius: "50%",
        background: `hsl(${hue}, 50%, 35%)`,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: size * 0.42,
        fontWeight: 600,
        color: `hsl(${hue}, 60%, 80%)`,
        flexShrink: 0,
        letterSpacing: -0.5
      }}
      aria-hidden
    >
      {initials}
    </div>
  );
}
