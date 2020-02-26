import { Component, ChangeDetectorRef } from '@angular/core';
import { BehaviorSubject } from 'rxjs';

// import { client, debug, xml } from '@xmpp/client';
import { BoshClient, $build, $iq, $pres, XmlElement } from 'xmpp-bosh-client/browser';
import { Strophe } from 'strophe.js';
import { unescapeXMLText } from 'ltx';

const USERNAME = 'admin@pupau-test.it';
const PASSWORD = 'password4321';
const URL = 'https://pupau-test.it:5280/http-bind/';

const INTERNAL_HISTORICAL_ID = 'historical_messages';
const INTERNAL_PRESENCE_ID = 'presence_user';
const INTERNAL_INIT_PRESENCE_ID = 'initial_presence_user';
const INTERNAL_CONTACT_LIST_ID = 'contact_list';

const XMPP_ROSTER_GET_VALUE = 'jabber:iq:roster';

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

  readonly xmppBoshClientContactList$ = new BehaviorSubject<string[] | undefined>(undefined);
  readonly xmppBoshClientPresence$ = new BehaviorSubject<string>('offline');
  readonly xmppBoshClientMessages$ = new BehaviorSubject<Message[]>([]);

  /** [strophe.js library] */
  private dismissObserver = new BehaviorSubject<string | undefined>(undefined);
  public dismiss: any;

  private BOSH_SERVICE = URL;
  private CONFERENCE_SERVICE = 'conference.localhost';
  private connection: Strophe.Connection;
  private roomName = '';

  constructor(
    private readonly cd: ChangeDetectorRef,
  ) {
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
      this.getContactListXmppBoshClient();
    });

    this.xmppBoshClient.on('ping', () => {
      console.log(`Ping received at ${new Date()}`);
    });

    this.xmppBoshClient.on('stanza', (stanza) => {
      // console.log(`Stanza received at ${new Date()}`, stanza);

      const messageId = stanza.attrs.id || undefined;
      const to = stanza.attrs.to || undefined;
      const from = stanza.attrs.from.toLowerCase();

      const type = stanza.attrs.type;
      const bodies = stanza.getChild('body');
      const message = bodies ? unescapeXMLText(bodies.getText()) : undefined;

      if (stanza.attrs.type === 'error') {
        console.log('Stanza request generate an error', stanza);
      } else {
        this.xmppBoshClientStanzaStream$.next(stanza);
      }

      if (stanza.name === 'message' && message) {
        console.log(` [CHAT MESSAGE]
        Message id: ${messageId}
        To: ${to}
        From: ${from}
        Type: ${type}
        Message: ${message || 'No message'}
        `);

        this.setMessageXmppBoshClient('receiver', message);
      } else if (stanza.name === 'message') {
        console.log('[PRESENCE] Get presence signal', stanza);

        this.setPresenceXmppBoshClient(stanza);
      } else if (messageId === INTERNAL_HISTORICAL_ID) {
        console.log('[HISTORICAL] Get historical messages', stanza);
      } else if (messageId === INTERNAL_CONTACT_LIST_ID) {
        console.log('[ROSTER] Get roaster items', stanza);

        this.setContactList(stanza);
      }
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
  selectContactHandler(jid: string) {

  }

  /** [xmpp-bosh-client library]  */
  sendDirectMessageHandler(message = 'Message test') {
    this.xmppBoshClient.sendMessage('user1@pupau-test.it', message);

    this.setMessageXmppBoshClient('sender', message);
  }

  /** [xmpp-bosh-client library]  */
  createStanzaHandler() {
    const root: XmlElement = $build('message', { to: 'user1@pupau-test.it' });
    root.cnode($build('header', {
      id: '123',
      jid: 'user1@pupau-test.it'
    }));
    this.xmppBoshClient.send(root);
  }

  /** [xmpp-bosh-client library]  */
  requestPresenceXmppBoshClient() {
    const root = $pres({
      id: INTERNAL_PRESENCE_ID,
      to: 'user1@pupau-test.it',
      type: 'subscribe',
    });

    this.xmppBoshClient.send(root);
  }

  /**
   * [xmpp-bosh-client library]
   *
   * @link https://xmpp.org/rfcs/rfc6121.html#roster-syntax-items
   */
  getContactListXmppBoshClient() {
    const root = $iq({ type: 'get', from: this.getUserIndentifier(), id: INTERNAL_CONTACT_LIST_ID });

    root.cnode($build('query', {
      xmlns: XMPP_ROSTER_GET_VALUE,
    }));

    this.xmppBoshClient.send(root);
  }

  /**
   * [xmpp-bosh-client library]
   *
   */
  private getHistoricalMessages() {
    const root = $iq({ type: 'set', id: INTERNAL_HISTORICAL_ID});
    root.cnode($build('query', {
      xmlns: 'urn:xmpp:mam:2',
      queryid: 'f27'
    }));

    this.xmppBoshClient.send(root);
  }

  /**
   * [xmpp-bosh-client library]
   *
   * @link https://xmpp.org/rfcs/rfc6121.html#presence-initial
   */
  private sendInitialPresence() {
    const root = $pres({ id: INTERNAL_INIT_PRESENCE_ID });

    this.xmppBoshClient.send(root);
  }

  /** [xmpp-bosh-client library]  */
  private setMessageXmppBoshClient(type: 'sender' | 'receiver', message: string) {
    const newMessage = { type, message };
    const oldMessages = this.xmppBoshClientMessages$.value;

    this.xmppBoshClientMessages$.next([...oldMessages, newMessage]);

    this.cd.markForCheck();
  }

  private setPresenceXmppBoshClient(stanza: XmlElement) {
    const statusElement = stanza.getChild('composing') || stanza.getChild('paused') || stanza.getChild('active');

    if (statusElement && statusElement.name) {
      this.xmppBoshClientPresence$.next(statusElement.name);
    }
  }

  private setContactList(stanza: XmlElement) {
    const query = stanza.getChild('query');
    const items = query.getChildren('item');
    const contacts = items.map((c) => c.getAttr('jid'));

    this.xmppBoshClientContactList$.next(contacts);
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
