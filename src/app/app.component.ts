import { Component } from '@angular/core';
import { BehaviorSubject } from 'rxjs';

// import { client, debug, xml } from '@xmpp/client';
import { BoshClient, $build, $iq, $pres, XmlElement } from 'xmpp-bosh-client/browser';
import { Strophe } from 'strophe.js';
import { unescapeXMLText } from 'ltx';

const USERNAME = 'admin@pupau-test.it';
const PASSWORD = 'password4321';
const URL = 'https://pupau-test.it:5280/http-bind/';

interface Message {
  type: 'sender' | 'receiver';
  message: string;
}

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.scss'],
})
export class AppComponent {
  /** [xmpp-bosh-client library] */
  private readonly xmppBoshClient: BoshClient;
  private readonly xmppBoshClientStanzaStream$ = new BehaviorSubject<XmlElement | undefined>(undefined);
  // TODO: Not used beacuse there is an error
  private readonly xmppBoshClientContactList$ = new BehaviorSubject<string | undefined>(undefined);
  readonly xmppBoshClientPresence$ = new BehaviorSubject<string>('offline');
  readonly xmppBoshClientMessages$ = new BehaviorSubject<Message[]>([]);

  /** [strophe.js library] */
  private dismissObserver = new BehaviorSubject<string | undefined>(undefined);
  public dismiss: any;

  private BOSH_SERVICE = URL;
  private CONFERENCE_SERVICE = 'conference.localhost';
  private connection: Strophe.Connection;
  private roomName = '';

  constructor() {
    /** [xmpp-bosh-client library]  */
    this.xmppBoshClient = new BoshClient(USERNAME, PASSWORD, URL);

    this.xmppBoshClient.on('error', (e) => {
      console.log('Error event');
      console.log(e);
    });

    this.xmppBoshClient.on('online', () => {
      console.log('Connected successfully');

      /**
       * NOTE: Need to override this method because it will produces some invalid 'from' value: admin@glue-labs.it/undefined
       * This value produce a remote-stream-error
       */
      (this.xmppBoshClient as any).sessionAttributes.jid.toString = () => {
        const jid = (this.xmppBoshClient as any).sessionAttributes.jid;
        return `${jid.username}@${jid.domain}/${jid.resource}`;
      };

      this.sendInitialPresence();
      // this.getContactListXmppBoshClient();
    });

    this.xmppBoshClient.on('ping', () => {
      console.log(`Ping received at ${new Date()}`);
    });

    this.xmppBoshClient.on('stanza', (stanza) => {
      console.log(`Stanza received at ${new Date()}`, stanza);

      const messageId = stanza.attrs.id || undefined;
      const to = stanza.attrs.to || undefined;
      const from = stanza.attrs.from.toLowerCase();

      const type = stanza.attrs.type;
      const bodies = stanza.getChild('body');
      const message = bodies ? unescapeXMLText(bodies.getText()) : undefined;

      if (stanza.attrs.type === 'error') {
        console.log('Stanza request generate an error');
      } else {
        this.xmppBoshClientStanzaStream$.next(stanza);
      }

      if (stanza.name === 'message' && message) {
        this.setMessageXmppBoshClient('receiver', message);
      } else if (stanza.name === 'message') {
        this.setPresenceXmppBoshClient(stanza);
      }

      console.log(`
      Message id: ${messageId}
      To: ${to}
      From: ${from}
      Type: ${type}
      Message: ${message || 'No message'}
      `);
    });

    this.xmppBoshClient.on('offline', (reason) => {
      console.log('Disconnected/Offline', reason);
    });

    this.xmppBoshClient.connect();

    /** [@xmpp/client library] */

    // const xmpp = client({
    //   service: 'ws://pupau-test:5280/xmpp-websocket',
    //   domain: 'pupau-test.it',
    //   username: USERNAME,
    //   password: PASSWORD,
    // });

    // debug(xmpp, true);

    // xmpp.on('error', (err: any) => {
    //   console.error(err);
    // });

    // xmpp.on('offline', () => {
    //   console.log('offline');
    // });

    // xmpp.on('stanza', async (stanza: any) => {
    //   if (stanza.is('message')) {
    //     await xmpp.send(xml('presence', { type: 'unavailable' }));
    //     await xmpp.stop();
    //   }
    // });

    // xmpp.on('online', async (address: string) => {
    //   // Makes itself available
    //   await xmpp.send(xml('presence'));

    //   // Sends a chat message to itself
    //   const message = xml(
    //     'message',
    //     { type: 'chat', to: address },
    //     xml('body', {}, 'hello world'),
    //   );
    //   await xmpp.send(message);
    // });

    // xmpp.start().catch(console.error);
  }

  /** [xmpp-bosh-client library]  */
  sendDirectMessageHandler(message = 'Message test') {
    this.xmppBoshClient.sendMessage('user1@pupau-test.it', message);

    this.setMessageXmppBoshClient('sender', message);
  }

  /** [xmpp-bosh-client library]  */
  createStanzaHandler() {
    const root: XmlElement = $build('message', { to: 'user1@pupau-test.it' });
    const child1 = root.cnode($build('header', {
      id: '123',
      jid: 'user1@pupau-test.it'
    }));
    // child1.cnode($build("some-element", {
    //     a: "1",
    //     b: 2
    // }));
    this.xmppBoshClient.send(root);
  }

  /** [xmpp-bosh-client library]  */
  requestPresenceXmppBoshClient() {
    const root = $pres({
      id: 'presence_user',
      to: 'user1@pupau-test.it',
      type: 'subscribe',
    });

    this.xmppBoshClient.send(root);
  }

  /**
   * [xmpp-bosh-client library]
   *
   * @link https://xmpp.org/rfcs/rfc6121.html#presence-initial
   */
  private sendInitialPresence() {
    const root = $pres({});

    this.xmppBoshClient.send(root);
  }

  /** [xmpp-bosh-client library]  */
  private setMessageXmppBoshClient(type: 'sender' | 'receiver', message: string) {
    const newMessage = { type, message };
    const oldMessages = this.xmppBoshClientMessages$.value;

    this.xmppBoshClientMessages$.next([ ...oldMessages, newMessage ]);
  }

  private setPresenceXmppBoshClient(stanza: XmlElement) {
    const statusElement = stanza.getChild('composing') || stanza.getChild('paused') || stanza.getChild('active');
    this.xmppBoshClientPresence$.next(statusElement.name);
  }

  /** [xmpp-bosh-client library]  */
  private getContactListXmppBoshClient() {
    const root = $iq({ type: 'get', from: this.getUserIndentifier(), id: 'contact_list' });

    root.cnode($build('query', {
      xmlns: 'jabber:iq:roaster',
    }));

    this.xmppBoshClient.send(root);
  }

  /**
   * [strophe.js library]
   *
   * Connects the client from the Jabber server.
   */
  login(user = USERNAME, pass = PASSWORD) {
    this.connection = new Strophe.Connection(this.BOSH_SERVICE, { keepalive: true });
    this.connection.connect(user, pass, (status) => {
      this.onConnect(status);
    });
  }

  /**
   * [strophe.js library]
   *
   * Disconnects the client from the Jabber server.
   */
  logout() {
    // this.connection.options.sync = true; // Switch to using synchronous requests since this is typically called onUnload.
    this.connection.flush();
    this.connection.disconnect('Logout from system');
  }

  private onMessage(message: any) {
    console.log(message);

    // $stanza = $(stanza);

    // messageId = $stanza.attr('id') || null;
    // to = $stanza.attr('to');
    // from = $stanza.attr('from').toLowerCase();
    // barejid = Strophe.getBareJidFromJid(from);

    // type = $stanza.attr('type');
    // bodies = $stanza.find('body');
    // body = bodies.length ? Strophe.xmlunescape(Strophe.getText(bodies[0])) : '';
  }

  /**
   * [strophe.js library]
   *
   * Connect XMPP
   */
  private onConnect(status: Strophe.Status) {
    switch (status) {
      case Strophe.Status.CONNECTED:
        console.log('[Connection] Strophe is Connected');

        this.connection.addHandler((msg) => { this.onMessage(msg); return true; }, null, 'message', null, null, null);
        // this.connection.addHandler((stanza) => { self.onSubscriptionRequest(stanza) }, null, "presence", "subscribe");

        this.dismissObserver.next('Login');

        break;
      case Strophe.Status.ATTACHED:
        console.log('[Connection] Strophe is Attached');
        break;

      case Strophe.Status.DISCONNECTED:
        console.log('[Connection] Strophe is Disconnected');
        this.dismissObserver.next('Logout');
        break;

      case Strophe.Status.AUTHFAIL:
        console.log('[Connection] Strophe is Authentication failed');
        break;

      case Strophe.Status.CONNECTING:
        console.log('[Connection] Strophe is Connecting');
        break;

      case Strophe.Status.DISCONNECTING:
        console.log('[Connection] Strophe is Disconnecting');
        break;

      case Strophe.Status.AUTHENTICATING:
        console.log('[Connection] Strophe is Authenticating');
        break;

      case Strophe.Status.ERROR:
      case Strophe.Status.CONNFAIL:
        console.log('[Connection] Failed (' + status + ')');
        break;

      default:
        console.log('[Connection] Unknown status received:', status);
        break;
    }
  }

  private getUserIndentifier() {
    return (this.xmppBoshClient as any).sessionAttributes.jid.toString();
  }
}
