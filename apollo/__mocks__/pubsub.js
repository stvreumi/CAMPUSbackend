// mock reference: https://jestjs.io/docs/manual-mocks#mocking-node-modules

const pubsub = jest.createMockFromModule('@google-cloud/pubsub');

// @ts-expect-error
class PubSub {
  // eslint-disable-next-line
  subscription() {
    return {
      on: jest.fn(),
    };
  }
}

pubsub.PubSub = PubSub;

module.exports = pubsub;
