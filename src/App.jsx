import { ChakraProvider } from '@chakra-ui/react';
import VideoChat from './VideoChat';

function App() {
  return (
    <ChakraProvider>
      <VideoChat />
    </ChakraProvider>
  );
}

export default App;
