/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        ibm: {
          dark: "#10151e",
          darker: "#080c12",
          gray: "#252d38",
          lightGray: "#525252",
          blue: "#c7a66b",
          blueHover: "#e2c38c",
          purple: "#8a3ffc",
          cyan: "#80cbcd",
          teal: "#007d79",
        },
      },
    },
  },
  plugins: [],
};
