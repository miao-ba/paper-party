// Seat colours, in seat order. Readable on the paper background and distinct for colour-blind players
// as far as 8 colours allow (pair them with avatars / names, never colour alone).
export const SEAT_COLORS = ['#e8604c', '#2f9e95', '#e0a400', '#3a78d6', '#d0559a', '#7a5cc7', '#4f9a3a', '#e07b28'] as const;
export const seatColor = (index: number) => SEAT_COLORS[((index % SEAT_COLORS.length) + SEAT_COLORS.length) % SEAT_COLORS.length];
