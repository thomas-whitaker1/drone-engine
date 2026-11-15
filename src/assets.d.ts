// What the bundler hands back for a file imported by address (gt#94): the URL it
// will be served from, in the dev server and in a build alike. Declared here
// rather than by pulling in the bundler's whole set of client types, because
// this is the one such import the project makes and the rest of that set is
// globals nothing else should start leaning on.
declare module '*.woff2?url' {
  const address: string;
  export default address;
}
