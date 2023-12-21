import {
  Box,
  Button,
  Container,
  Flex,
  HStack,
  Input,
  Text,
  VStack,
  useToast,
} from '@chakra-ui/react';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { firestore } from './firebase';
import {
  addDoc,
  collection,
  doc,
  getDoc,
  onSnapshot,
  setDoc,
  updateDoc,
} from 'firebase/firestore';
const servers = {
  iceServers: [
    {
      urls: ['stun:stun1.l.google.com:19302', 'stun:stun2.l.google.com:19302'],
    },
  ],
  iceCandidatePoolSize: 10,
};

const pc = new RTCPeerConnection(servers);
let localStream = null;
let remoteStream = null;
export default function VideoChat() {
  const [callLink, setCallLink] = useState('');
  const params = new URLSearchParams(
    `?${window.location.search.split('?')[1]}`
  );
  const callIdFromLink = params.get('callId');
  const localVideoRef = useRef();
  const remoteVideoRef = useRef();
  const callButtonRef = useRef();
  const answerButtonRef = useRef();
  const webcamButtonRef = useRef();
  const hangupButtonRef = useRef();
  const callInputRef = useRef();
  const toast = useToast();
  const [isCallStarted, setIsCallStarted] = useState(false);
  const [isWebCamStarted, setIsWebCamStarted] = useState(false);
  const onWebCamStart = useCallback(async () => {
    localStream = await navigator.mediaDevices.getUserMedia({
      video: true,
      audio: true,
    });
    remoteStream = new MediaStream();
    setIsWebCamStarted(true);

    // Push tracks from local stream to peer connection
    localStream.getTracks().forEach((track) => {
      pc.addTrack(track, localStream);
    });

    // Pull tracks from remote stream, add to video stream
    pc.ontrack = (event) => {
      event.streams[0].getTracks().forEach((track) => {
        remoteStream.addTrack(track);
      });
    };

    localVideoRef.current.srcObject = localStream;
    remoteVideoRef.current.srcObject = remoteStream;
  }, []);

  const onCall = useCallback(async () => {
    // Reference Firestore collections for signaling
    setIsCallStarted(true);
    const callDoc = doc(collection(firestore, 'calls'));
    const offerCandidates = collection(callDoc, 'offerCandidates');
    const answerCandidates = collection(callDoc, 'answerCandidates');

    callInputRef.current.value = callDoc.id;

    setCallLink(`${window.location.origin}?callId=${callDoc.id}`);

    // Get candidates for caller, save to db
    pc.onicecandidate = (event) => {
      event.candidate && addDoc(offerCandidates, event.candidate.toJSON());
    };

    // Create offer
    const offerDescription = await pc.createOffer();
    await pc.setLocalDescription(offerDescription);

    const offer = {
      sdp: offerDescription.sdp,
      type: offerDescription.type,
    };

    await setDoc(callDoc, { offer });

    // Listen for remote answer
    onSnapshot(callDoc, (snapshot) => {
      const data = snapshot.data();
      if (!pc.currentRemoteDescription && data?.answer) {
        const answerDescription = new RTCSessionDescription(data.answer);
        pc.setRemoteDescription(answerDescription);
      }
    });

    // When answered, add candidate to peer connection
    onSnapshot(answerCandidates, (snapshot) => {
      snapshot.docChanges().forEach((change) => {
        if (change.type === 'added') {
          const candidate = new RTCIceCandidate(change.doc.data());
          pc.addIceCandidate(candidate);
        }
      });
    });

    toast({
      title: 'Call created',
      description: 'Share this link with your partner',
      status: 'success',
      duration: 3000,
      isClosable: true,
      position: 'bottom-right',
    });
  }, [hangupButtonRef, callInputRef, pc]);

  const onAnswer = useCallback(async () => {
    toast({
      title: 'Answering call',
      description: 'Please wait',
      status: 'info',
      duration: 3000,
      isClosable: true,
      position: 'bottom-right',
    });
    const callId = callInputRef.current.value;
    const callDoc = doc(firestore, 'calls', callId);
    const answerCandidates = collection(callDoc, 'answerCandidates');
    const offerCandidates = collection(callDoc, 'offerCandidates');

    pc.onicecandidate = (event) => {
      event.candidate && addDoc(answerCandidates, event.candidate.toJSON());
    };

    const callData = (await getDoc(callDoc)).data();

    const offerDescription = callData.offer;
    await pc.setRemoteDescription(new RTCSessionDescription(offerDescription));

    const answerDescription = await pc.createAnswer();
    await pc.setLocalDescription(answerDescription);

    const answer = {
      type: answerDescription.type,
      sdp: answerDescription.sdp,
    };

    await updateDoc(callDoc, { answer });

    onSnapshot(offerCandidates, (snapshot) => {
      snapshot.docChanges().forEach((change) => {
        console.log(change);
        if (change.type === 'added') {
          let data = change.doc.data();
          pc.addIceCandidate(new RTCIceCandidate(data));
        }
      });
    });
  }, []);

  useEffect(() => {
    if (callIdFromLink) {
      callInputRef.current.value = callIdFromLink;
    }
  }, []);

  return (
    <Container>
      <VStack mb={4}>
        <Box>
          <Text>Your Video</Text>
          <video
            ref={localVideoRef}
            autoPlay
            playsInline
            muted
            style={{ width: 400, height: 300, transform: 'rotateY(180deg)' }}
          />
        </Box>
        <Box>
          <Text>Remote Video</Text>
          <video
            ref={remoteVideoRef}
            autoPlay
            playsInline
            style={{ width: 400, height: 300, transform: 'rotateY(180deg)' }}
          />
        </Box>
      </VStack>
      <Box maxW='400px' margin='auto'>
        <HStack>
          {!isCallStarted && isWebCamStarted && (
            <Button ref={callButtonRef} onClick={onCall}>
              Create Call (offer)
            </Button>
          )}
          {callLink && (
            <Button
              onClick={() => {
                navigator.clipboard.writeText(callLink);
                toast({
                  title: 'Copied',
                  description: 'Call link copied to clipboard',
                  status: 'success',
                  duration: 3000,
                  isClosable: true,
                  position: 'bottom-right',
                });
              }}
            >
              Copy link
            </Button>
          )}
        </HStack>
        <HStack mt={4}>
          <Input
            maxW='200px'
            ref={callInputRef}
            placeholder='Paste the call id'
          />
          {!isWebCamStarted ? (
            <Button px={2} ref={webcamButtonRef} onClick={onWebCamStart}>
              Start Camera
            </Button>
          ) : (
            <Button
              px={6}
              colorScheme='green'
              ref={answerButtonRef}
              onClick={onAnswer}
              isDisabled={isCallStarted || !isWebCamStarted}
            >
              Connect
            </Button>
          )}
          {isCallStarted && (
            <Button
              px={6}
              onClick={() => {
                window.location.reload();
              }}
              isDisabled={!isCallStarted}
              colorScheme='red'
            >
              Hangup
            </Button>
          )}
        </HStack>
      </Box>
    </Container>
  );
}
