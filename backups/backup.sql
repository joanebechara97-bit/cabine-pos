--
-- PostgreSQL database dump
--

\restrict abqqRG8ni4SYAii0IOqspZLCJwiD5VUj0a1Q334xjyaghrefzUakbb0bUEhb4dW

-- Dumped from database version 17.8 (6108b59)
-- Dumped by pg_dump version 18.3

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: AuditLog; Type: TABLE; Schema: public; Owner: neondb_owner
--

CREATE TABLE public."AuditLog" (
    id integer NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "actorId" integer,
    "actorName" text,
    action text NOT NULL,
    details text
);


ALTER TABLE public."AuditLog" OWNER TO neondb_owner;

--
-- Name: AuditLog_id_seq; Type: SEQUENCE; Schema: public; Owner: neondb_owner
--

CREATE SEQUENCE public."AuditLog_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public."AuditLog_id_seq" OWNER TO neondb_owner;

--
-- Name: AuditLog_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: neondb_owner
--

ALTER SEQUENCE public."AuditLog_id_seq" OWNED BY public."AuditLog".id;


--
-- Name: InvoiceCounter; Type: TABLE; Schema: public; Owner: neondb_owner
--

CREATE TABLE public."InvoiceCounter" (
    id integer DEFAULT 1 NOT NULL,
    "lastNo" integer DEFAULT 0 NOT NULL
);


ALTER TABLE public."InvoiceCounter" OWNER TO neondb_owner;

--
-- Name: Item; Type: TABLE; Schema: public; Owner: neondb_owner
--

CREATE TABLE public."Item" (
    id text NOT NULL,
    name text NOT NULL,
    price double precision NOT NULL,
    type text DEFAULT 'service'::text NOT NULL,
    "isActive" boolean DEFAULT true NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);


ALTER TABLE public."Item" OWNER TO neondb_owner;

--
-- Name: License; Type: TABLE; Schema: public; Owner: neondb_owner
--

CREATE TABLE public."License" (
    id integer NOT NULL,
    key text NOT NULL,
    business text,
    "expiresAt" timestamp(3) without time zone,
    active boolean DEFAULT true NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


ALTER TABLE public."License" OWNER TO neondb_owner;

--
-- Name: License_id_seq; Type: SEQUENCE; Schema: public; Owner: neondb_owner
--

CREATE SEQUENCE public."License_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public."License_id_seq" OWNER TO neondb_owner;

--
-- Name: License_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: neondb_owner
--

ALTER SEQUENCE public."License_id_seq" OWNED BY public."License".id;


--
-- Name: Order; Type: TABLE; Schema: public; Owner: neondb_owner
--

CREATE TABLE public."Order" (
    id integer NOT NULL,
    status text DEFAULT 'DRAFT'::text NOT NULL,
    "invoiceNumber" integer,
    "confirmedAt" timestamp(3) without time zone,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "voidedAt" timestamp(3) without time zone,
    "voidReason" text,
    "voidedById" integer,
    "voidedByName" text,
    "refundedAt" timestamp(3) without time zone,
    "refundReason" text,
    "refundMethod" text,
    "refundAmount" integer,
    "refundedById" integer,
    "refundedByName" text,
    "createdById" integer,
    "discountAmount" double precision DEFAULT 0 NOT NULL,
    "discountType" text DEFAULT 'fixed'::text NOT NULL,
    "discountValue" double precision DEFAULT 0 NOT NULL
);


ALTER TABLE public."Order" OWNER TO neondb_owner;

--
-- Name: OrderItem; Type: TABLE; Schema: public; Owner: neondb_owner
--

CREATE TABLE public."OrderItem" (
    id integer NOT NULL,
    "orderId" integer NOT NULL,
    category text NOT NULL,
    qty integer NOT NULL,
    price double precision NOT NULL
);


ALTER TABLE public."OrderItem" OWNER TO neondb_owner;

--
-- Name: OrderItem_id_seq; Type: SEQUENCE; Schema: public; Owner: neondb_owner
--

CREATE SEQUENCE public."OrderItem_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public."OrderItem_id_seq" OWNER TO neondb_owner;

--
-- Name: OrderItem_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: neondb_owner
--

ALTER SEQUENCE public."OrderItem_id_seq" OWNED BY public."OrderItem".id;


--
-- Name: Order_id_seq; Type: SEQUENCE; Schema: public; Owner: neondb_owner
--

CREATE SEQUENCE public."Order_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public."Order_id_seq" OWNER TO neondb_owner;

--
-- Name: Order_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: neondb_owner
--

ALTER SEQUENCE public."Order_id_seq" OWNED BY public."Order".id;


--
-- Name: User; Type: TABLE; Schema: public; Owner: neondb_owner
--

CREATE TABLE public."User" (
    id integer NOT NULL,
    username text NOT NULL,
    "passwordHash" text NOT NULL,
    role text DEFAULT 'FRONT_DESK'::text NOT NULL,
    "permissionsJson" text DEFAULT '{}'::text NOT NULL,
    "isActive" boolean DEFAULT true NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


ALTER TABLE public."User" OWNER TO neondb_owner;

--
-- Name: User_id_seq; Type: SEQUENCE; Schema: public; Owner: neondb_owner
--

CREATE SEQUENCE public."User_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public."User_id_seq" OWNER TO neondb_owner;

--
-- Name: User_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: neondb_owner
--

ALTER SEQUENCE public."User_id_seq" OWNED BY public."User".id;


--
-- Name: _prisma_migrations; Type: TABLE; Schema: public; Owner: neondb_owner
--

CREATE TABLE public._prisma_migrations (
    id character varying(36) NOT NULL,
    checksum character varying(64) NOT NULL,
    finished_at timestamp with time zone,
    migration_name character varying(255) NOT NULL,
    logs text,
    rolled_back_at timestamp with time zone,
    started_at timestamp with time zone DEFAULT now() NOT NULL,
    applied_steps_count integer DEFAULT 0 NOT NULL
);


ALTER TABLE public._prisma_migrations OWNER TO neondb_owner;

--
-- Name: user_sessions; Type: TABLE; Schema: public; Owner: neondb_owner
--

CREATE TABLE public.user_sessions (
    sid character varying NOT NULL,
    sess json NOT NULL,
    expire timestamp(6) without time zone NOT NULL
);


ALTER TABLE public.user_sessions OWNER TO neondb_owner;

--
-- Name: AuditLog id; Type: DEFAULT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public."AuditLog" ALTER COLUMN id SET DEFAULT nextval('public."AuditLog_id_seq"'::regclass);


--
-- Name: License id; Type: DEFAULT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public."License" ALTER COLUMN id SET DEFAULT nextval('public."License_id_seq"'::regclass);


--
-- Name: Order id; Type: DEFAULT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public."Order" ALTER COLUMN id SET DEFAULT nextval('public."Order_id_seq"'::regclass);


--
-- Name: OrderItem id; Type: DEFAULT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public."OrderItem" ALTER COLUMN id SET DEFAULT nextval('public."OrderItem_id_seq"'::regclass);


--
-- Name: User id; Type: DEFAULT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public."User" ALTER COLUMN id SET DEFAULT nextval('public."User_id_seq"'::regclass);


--
-- Data for Name: AuditLog; Type: TABLE DATA; Schema: public; Owner: neondb_owner
--

COPY public."AuditLog" (id, "createdAt", "actorId", "actorName", action, details) FROM stdin;
1	2026-03-11 09:43:37.381	1	JoB	ORDER_CONFIRMED	orderId=1 invoice=1
2	2026-03-11 10:00:01.166	1	JoB	USER_CREATE	username=FrontDesk role=FRONT_DESK active=true
3	2026-03-11 10:34:52.227	1	JoB	ORDER_CONFIRMED	orderId=2 invoice=2
4	2026-03-11 10:38:23.201	1	JoB	ORDER_CONFIRMED	orderId=3 invoice=3
5	2026-03-11 10:58:10.044	1	JoB	ORDER_CONFIRMED	orderId=4 invoice=4
6	2026-03-11 10:58:10.964	1	JoB	ORDER_CONFIRMED	orderId=5 invoice=5
7	2026-03-11 10:59:22.526	1	JoB	ORDER_CONFIRMED	orderId=6 invoice=6
8	2026-03-11 11:08:33.264	1	JoB	ORDER_CONFIRMED	orderId=7 invoice=7
9	2026-03-11 11:08:47.641	1	JoB	ORDER_CONFIRMED	orderId=8 invoice=8
10	2026-03-11 11:09:30.591	1	JoB	ORDER_CONFIRMED	orderId=9 invoice=9
11	2026-03-11 11:19:42.259	1	JoB	ORDER_CONFIRMED	orderId=10 invoice=10
12	2026-03-11 11:37:20.595	1	JoB	ORDER_CONFIRMED	orderId=11 invoice=11
13	2026-03-11 12:20:50.046	1	JoB	ORDER_CONFIRMED	orderId=12 invoice=12
14	2026-03-12 06:55:37.744	1	JoB	ORDER_CONFIRMED	orderId=13 invoice=13
15	2026-03-12 07:02:51.496	1	JoB	ORDER_CONFIRMED	orderId=14 invoice=14
16	2026-03-12 07:38:45.647	1	JoB	ORDER_CONFIRMED	orderId=15 invoice=15
17	2026-03-12 07:44:00.696	1	JoB	ORDER_CONFIRMED	orderId=16 invoice=16
18	2026-03-12 07:44:51.704	1	JoB	ORDER_CONFIRMED	orderId=17 invoice=17
19	2026-03-12 07:46:28.681	1	JoB	ORDER_CONFIRMED	orderId=18 invoice=18
20	2026-03-12 07:58:25.814	1	JoB	ORDER_CONFIRMED	orderId=19 invoice=19
21	2026-03-12 07:59:18.291	1	JoB	ORDER_CONFIRMED	orderId=20 invoice=20
22	2026-03-12 09:54:55.099	1	JoB	ORDER_CONFIRMED	orderId=21 invoice=21
23	2026-03-12 10:50:07.373	1	JoB	ORDER_CONFIRMED	orderId=22 invoice=22
24	2026-03-12 10:50:21.709	1	JoB	ORDER_CONFIRMED	orderId=23 invoice=23
25	2026-03-12 11:00:30.154	1	JoB	ORDER_CONFIRMED	orderId=24 invoice=24
26	2026-03-12 11:25:43.399	1	JoB	ORDER_CONFIRMED	orderId=25 invoice=25
27	2026-03-12 11:25:46.543	1	JoB	ORDER_CONFIRMED	orderId=26 invoice=26
28	2026-03-12 11:34:48.906	1	JoB	ORDER_CONFIRMED	orderId=27 invoice=27
29	2026-03-12 11:44:52.225	1	JoB	ORDER_CONFIRMED	orderId=28 invoice=28
30	2026-03-12 12:46:09.123	1	JoB	ORDER_CONFIRMED	orderId=29 invoice=29
31	2026-03-12 12:51:09.676	1	JoB	ORDER_CONFIRMED	orderId=30 invoice=30
32	2026-03-12 12:51:23.476	1	JoB	ORDER_CONFIRMED	orderId=31 invoice=31
33	2026-03-13 07:17:31.625	1	JoB	ORDER_CONFIRMED	orderId=32 invoice=32
34	2026-03-13 07:20:11.599	1	JoB	ORDER_CONFIRMED	orderId=33 invoice=33
35	2026-03-13 07:29:07.218	1	JoB	USER_UPDATE	userId=2 username=FrontDesk role=FRONT_DESK active=true
36	2026-03-13 07:32:48.098	1	JoB	ORDER_CONFIRMED	orderId=34 invoice=34
37	2026-03-13 07:37:11.367	1	JoB	ORDER_CONFIRMED	orderId=35 invoice=35
38	2026-03-13 07:42:12.51	1	JoB	ORDER_CONFIRMED	orderId=36 invoice=36
39	2026-03-13 07:42:22.764	1	JoB	ORDER_CONFIRMED	orderId=37 invoice=37
40	2026-03-13 07:45:23.138	1	JoB	USER_CREATE	username=Georgia role=FRONT_DESK active=true
41	2026-03-13 07:45:48.942	1	JoB	ORDER_CONFIRMED	orderId=38 invoice=38
42	2026-03-13 07:51:49.444	1	JoB	ORDER_CONFIRMED	orderId=39 invoice=39
43	2026-03-13 07:53:01.75	1	JoB	INVOICE_VOIDED	orderId=39 invoice=39 reason=by mistake
44	2026-03-13 07:56:43.384	1	JoB	ORDER_CONFIRMED	orderId=40 invoice=40
45	2026-03-13 07:59:50.514	3	Georgia	ORDER_CONFIRMED	orderId=41 invoice=41
46	2026-03-13 08:05:10.309	3	Georgia	ORDER_CONFIRMED	orderId=43 invoice=42
47	2026-03-13 10:25:55.32	1	JoB	ORDER_CONFIRMED	orderId=44 invoice=43
48	2026-03-13 10:31:19.37	1	JoB	ORDER_CONFIRMED	orderId=45 invoice=44
49	2026-03-13 10:34:53.93	1	JoB	ORDER_CONFIRMED	orderId=46 invoice=45
50	2026-03-13 10:42:46.711	1	JoB	ORDER_CONFIRMED	orderId=47 invoice=46
51	2026-03-13 10:43:57.386	1	JoB	INVOICE_VOIDED	orderId=47 invoice=46 reason=ByMistake
52	2026-03-13 13:09:46.221	1	JoB	INVOICE_VOIDED	orderId=46 invoice=45 reason=ByMistake
53	2026-03-13 13:28:49.083	1	JoB	INVOICE_VOIDED	orderId=40 invoice=40 reason=ByMistake
54	2026-03-13 13:29:56.566	1	JoB	INVOICE_VOIDED	orderId=41 invoice=41 reason=ByMistake
55	2026-03-13 13:37:56.514	1	JoB	INVOICE_VOIDED	orderId=43 invoice=42 reason=ByMistake
56	2026-03-13 13:51:40.503	1	JoB	INVOICE_VOIDED	orderId=44 invoice=43 reason=ByMistake
57	2026-03-14 07:54:07.035	1	JoB	ORDER_CONFIRMED	orderId=48 invoice=47
58	2026-03-14 08:14:32.986	1	JoB	ORDER_CONFIRMED	orderId=49 invoice=48
59	2026-03-14 08:23:24.703	1	JoB	INVOICE_VOIDED	orderId=49 invoice=48 reason=ByMistake
60	2026-03-14 08:29:58.363	1	JoB	ORDER_CONFIRMED	orderId=50 invoice=49
61	2026-03-14 08:30:28.767	1	JoB	ORDER_CONFIRMED	orderId=51 invoice=50
62	2026-03-14 08:31:59.881	1	JoB	INVOICE_VOIDED	orderId=50 invoice=49 reason=ByMistake
63	2026-03-14 08:33:03.953	1	JoB	INVOICE_VOIDED	orderId=51 invoice=50 reason=ByMistake
64	2026-03-14 08:33:47.296	1	JoB	INVOICE_VOIDED	orderId=45 invoice=44 reason=ByMistake
65	2026-03-14 08:36:54.546	1	JoB	ORDER_CONFIRMED	orderId=52 invoice=51
66	2026-03-14 08:37:08.219	1	JoB	INVOICE_VOIDED	orderId=52 invoice=51 reason=ByMistake
67	2026-03-14 08:37:55.24	1	JoB	ORDER_CONFIRMED	orderId=53 invoice=52
68	2026-03-14 08:38:28.82	1	JoB	INVOICE_VOIDED	orderId=53 invoice=52 reason=ByMistake
\.


--
-- Data for Name: InvoiceCounter; Type: TABLE DATA; Schema: public; Owner: neondb_owner
--

COPY public."InvoiceCounter" (id, "lastNo") FROM stdin;
1	52
\.


--
-- Data for Name: Item; Type: TABLE DATA; Schema: public; Owner: neondb_owner
--

COPY public."Item" (id, name, price, type, "isActive", "createdAt", "updatedAt") FROM stdin;
cmmlupadi00008tl762c9vauv	Adult WD	20	service	t	2026-03-11 09:42:59.525	2026-03-11 09:42:59.525
cmmlupj8400018tl7f46p0hon	Adult WE	25	service	t	2026-03-11 09:43:10.934	2026-03-11 09:43:10.934
cmmluppef00028tl7g3iidr0w	Kids WE	10	service	t	2026-03-11 09:43:19	2026-03-11 09:43:19
cmmlupxjp00038tl72lof3my5	Kids WD	10	service	t	2026-03-11 09:43:29.495	2026-03-11 09:43:29.495
\.


--
-- Data for Name: License; Type: TABLE DATA; Schema: public; Owner: neondb_owner
--

COPY public."License" (id, key, business, "expiresAt", active, "createdAt") FROM stdin;
1	SS-9F82K2-LX29P3	San Stephano Resort	\N	t	2026-03-12 13:17:29.526
\.


--
-- Data for Name: Order; Type: TABLE DATA; Schema: public; Owner: neondb_owner
--

COPY public."Order" (id, status, "invoiceNumber", "confirmedAt", "createdAt", "voidedAt", "voidReason", "voidedById", "voidedByName", "refundedAt", "refundReason", "refundMethod", "refundAmount", "refundedById", "refundedByName", "createdById", "discountAmount", "discountType", "discountValue") FROM stdin;
1	CONFIRMED	1	2026-03-11 09:43:37.05	2026-03-11 09:43:35.868	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0	fixed	0
2	CONFIRMED	2	2026-03-11 10:34:51.912	2026-03-11 10:34:50.72	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0	fixed	0
3	CONFIRMED	3	2026-03-11 10:38:22.883	2026-03-11 10:38:21.533	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0	fixed	0
4	CONFIRMED	4	2026-03-11 10:58:09.721	2026-03-11 10:58:08.339	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0	fixed	0
5	CONFIRMED	5	2026-03-11 10:58:10.658	2026-03-11 10:58:09.18	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0	fixed	0
6	CONFIRMED	6	2026-03-11 10:59:22.266	2026-03-11 10:59:21.048	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0	fixed	0
7	CONFIRMED	7	2026-03-11 11:08:32.936	2026-03-11 11:08:31.524	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0	fixed	0
8	CONFIRMED	8	2026-03-11 11:08:47.384	2026-03-11 11:08:46.511	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0	fixed	0
9	CONFIRMED	9	2026-03-11 11:09:30.337	2026-03-11 11:09:29.461	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0	fixed	0
10	CONFIRMED	10	2026-03-11 11:19:41.921	2026-03-11 11:19:40.564	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0	fixed	0
11	CONFIRMED	11	2026-03-11 11:37:20.276	2026-03-11 11:37:18.863	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0	fixed	0
12	CONFIRMED	12	2026-03-11 12:20:49.721	2026-03-11 12:20:48.363	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0	fixed	0
13	CONFIRMED	13	2026-03-12 06:55:37.411	2026-03-12 06:55:36.129	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	1	0	fixed	0
14	CONFIRMED	14	2026-03-12 07:02:51.15	2026-03-12 07:02:49.989	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	1	0	fixed	0
15	CONFIRMED	15	2026-03-12 07:38:45.34	2026-03-12 07:38:44.172	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	1	0	fixed	0
16	CONFIRMED	16	2026-03-12 07:44:00.386	2026-03-12 07:43:59.215	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	1	0	fixed	0
17	CONFIRMED	17	2026-03-12 07:44:51.443	2026-03-12 07:44:50.647	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	1	0	fixed	0
18	CONFIRMED	18	2026-03-12 07:46:28.426	2026-03-12 07:46:27.625	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	1	0	fixed	0
19	CONFIRMED	19	2026-03-12 07:58:25.5	2026-03-12 07:58:24.302	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	1	0	fixed	0
20	CONFIRMED	20	2026-03-12 07:59:18.038	2026-03-12 07:59:17.155	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	1	13	percent	20
21	CONFIRMED	21	2026-03-12 09:54:54.78	2026-03-12 09:54:53.389	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	1	5.5	percent	10
22	CONFIRMED	22	2026-03-12 10:50:07.049	2026-03-12 10:50:05.702	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	1	0	fixed	0
23	CONFIRMED	23	2026-03-12 10:50:21.451	2026-03-12 10:50:20.561	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	1	0	fixed	0
24	CONFIRMED	24	2026-03-12 11:00:29.846	2026-03-12 11:00:28.589	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	1	0	fixed	0
25	CONFIRMED	25	2026-03-12 11:25:43.08	2026-03-12 11:25:41.817	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	1	0	fixed	0
26	CONFIRMED	26	2026-03-12 11:25:46.23	2026-03-12 11:25:43.655	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	1	0	fixed	0
27	CONFIRMED	27	2026-03-12 11:34:48.587	2026-03-12 11:34:47.368	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	1	0	fixed	0
28	CONFIRMED	28	2026-03-12 11:44:51.908	2026-03-12 11:44:50.694	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	1	0	fixed	0
29	CONFIRMED	29	2026-03-12 12:46:08.701	2026-03-12 12:46:07.477	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	1	0	fixed	0
30	CONFIRMED	30	2026-03-12 12:51:09.215	2026-03-12 12:51:08.053	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	1	0	fixed	0
31	CONFIRMED	31	2026-03-12 12:51:23.149	2026-03-12 12:51:22.387	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	1	12.5	percent	50
32	CONFIRMED	32	2026-03-13 07:17:30.51	2026-03-13 07:17:27.258	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	1	0	fixed	0
33	CONFIRMED	33	2026-03-13 07:20:10.439	2026-03-13 07:20:07.383	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	1	0	fixed	0
34	CONFIRMED	34	2026-03-13 07:32:46.956	2026-03-13 07:32:43.817	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	1	0	fixed	0
35	CONFIRMED	35	2026-03-13 07:37:10.162	2026-03-13 07:37:06.682	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	1	25	percent	50
36	CONFIRMED	36	2026-03-13 07:42:11.41	2026-03-13 07:42:08.359	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	1	10	fixed	10
37	CONFIRMED	37	2026-03-13 07:42:21.431	2026-03-13 07:42:13.195	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	1	10	fixed	10
38	CONFIRMED	38	2026-03-13 07:45:48.11	2026-03-13 07:45:45.407	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	1	0	fixed	0
39	VOIDED	39	2026-03-13 07:51:48.271	2026-03-13 07:51:45.083	2026-03-13 07:53:00.658	by mistake	1	JoB	\N	\N	\N	\N	\N	\N	1	0	fixed	0
42	DRAFT	\N	\N	2026-03-13 07:59:52.099	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	3	0	fixed	0
47	VOIDED	46	2026-03-13 10:42:46.272	2026-03-13 10:42:45.062	2026-03-13 10:43:57.01	ByMistake	1	JoB	\N	\N	\N	\N	\N	\N	1	0	fixed	0
46	VOIDED	45	2026-03-13 10:34:53.464	2026-03-13 10:34:52.188	2026-03-13 13:09:45.748	ByMistake	1	JoB	\N	\N	\N	\N	\N	\N	1	0	fixed	0
40	VOIDED	40	2026-03-13 07:56:42.221	2026-03-13 07:56:39.143	2026-03-13 13:28:48.647	ByMistake	1	JoB	\N	\N	\N	\N	\N	\N	1	0	fixed	0
41	VOIDED	41	2026-03-13 07:59:49.393	2026-03-13 07:59:46.262	2026-03-13 13:29:56.064	ByMistake	1	JoB	\N	\N	\N	\N	\N	\N	3	0	fixed	0
43	VOIDED	42	2026-03-13 08:05:09.107	2026-03-13 08:05:05.611	2026-03-13 13:37:56.019	ByMistake	1	JoB	\N	\N	\N	\N	\N	\N	3	0	fixed	0
44	VOIDED	43	2026-03-13 10:25:54.873	2026-03-13 10:25:53.622	2026-03-13 13:51:40.043	ByMistake	1	JoB	\N	\N	\N	\N	\N	\N	1	0	fixed	0
48	CONFIRMED	47	2026-03-14 07:54:06.595	2026-03-14 07:54:05.345	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	1	0	fixed	0
49	VOIDED	48	2026-03-14 08:14:32.542	2026-03-14 08:14:31.331	2026-03-14 08:23:24.26	ByMistake	1	JoB	\N	\N	\N	\N	\N	\N	1	0	fixed	0
50	VOIDED	49	2026-03-14 08:29:57.923	2026-03-14 08:29:56.744	2026-03-14 08:31:59.5	ByMistake	1	JoB	\N	\N	\N	\N	\N	\N	1	40	percent	50
51	VOIDED	50	2026-03-14 08:30:28.453	2026-03-14 08:30:27.566	2026-03-14 08:33:03.486	ByMistake	1	JoB	\N	\N	\N	\N	\N	\N	1	60	fixed	60
45	VOIDED	44	2026-03-13 10:31:18.923	2026-03-13 10:31:17.654	2026-03-14 08:33:46.983	ByMistake	1	JoB	\N	\N	\N	\N	\N	\N	1	0	fixed	0
52	VOIDED	51	2026-03-14 08:36:54.108	2026-03-14 08:36:53.139	2026-03-14 08:37:07.903	ByMistake	1	JoB	\N	\N	\N	\N	\N	\N	1	0	fixed	0
53	VOIDED	52	2026-03-14 08:37:54.928	2026-03-14 08:37:54.039	2026-03-14 08:38:28.384	ByMistake	1	JoB	\N	\N	\N	\N	\N	\N	1	0	fixed	0
\.


--
-- Data for Name: OrderItem; Type: TABLE DATA; Schema: public; Owner: neondb_owner
--

COPY public."OrderItem" (id, "orderId", category, qty, price) FROM stdin;
1	1	Adult WE	1	25
2	2	Adult WE	1	25
3	3	Adult WE	1	25
4	3	Adult WD	1	20
5	3	Kids WD	1	10
6	3	Kids WE	1	10
7	4	Adult WD	1	20
8	4	Adult WE	1	25
9	4	Kids WD	4	10
10	4	Kids WE	1	10
11	5	Adult WD	1	20
12	5	Adult WE	1	25
13	5	Kids WD	4	10
14	5	Kids WE	1	10
15	6	Adult WD	3	20
16	6	Adult WE	3	25
17	6	Kids WD	3	10
18	6	Kids WE	3	10
19	7	Adult WD	2	20
20	7	Adult WE	1	25
21	7	Kids WD	2	10
22	7	Kids WE	2	10
23	8	Adult WE	2	25
24	9	Adult WD	1	20
25	9	Adult WE	1	25
26	9	Kids WD	1	10
27	10	Adult WD	3	20
28	10	Adult WE	4	25
29	10	Kids WE	1	10
30	11	Adult WD	4	20
31	11	Adult WE	4	25
32	11	Kids WD	1	10
33	11	Kids WE	2	10
34	12	Adult WD	2	20
35	12	Adult WE	1	25
36	13	Adult WD	2	20
37	13	Adult WE	2	25
38	14	Adult WE	1	25
39	15	Adult WE	1	25
40	16	Adult WD	2	20
41	17	Adult WE	1	25
42	18	Adult WD	1	20
43	19	Adult WD	2	20
44	19	Adult WE	3	25
45	19	Kids WD	4	10
46	19	Kids WE	2	10
47	20	Adult WE	1	25
48	20	Adult WD	2	20
49	21	Adult WE	1	25
50	21	Adult WD	1	20
51	21	Kids WD	1	10
52	22	Adult WD	1	20
53	22	Adult WE	1	25
54	22	Kids WE	1	10
55	22	Kids WD	1	10
56	23	Adult WE	1	25
57	23	Adult WD	1	20
58	23	Kids WD	1	10
59	23	Kids WE	1	10
60	24	Adult WD	1	20
61	24	Adult WE	1	25
62	25	Adult WE	1	25
63	25	Adult WD	1	20
64	25	Kids WD	1	10
65	26	Adult WE	1	25
66	26	Adult WD	1	20
67	26	Kids WD	1	10
68	27	Adult WE	1	25
69	27	Adult WD	1	20
70	27	Kids WD	2	10
71	28	Adult WE	1	25
72	28	Adult WD	1	20
73	28	Kids WE	1	10
74	29	Adult WD	1	20
75	29	Adult WE	1	25
76	30	Adult WD	1	20
77	31	Adult WE	1	25
78	32	Adult WD	1	20
79	32	Adult WE	1	25
80	32	Kids WD	1	10
81	32	Kids WE	1	10
82	33	Adult WD	2	20
83	34	Adult WD	1	20
84	34	Adult WE	1	25
85	34	Kids WD	1	10
86	34	Kids WE	1	10
87	35	Adult WD	2	20
88	35	Kids WE	1	10
89	36	Adult WE	4	25
90	36	Kids WE	4	10
91	36	Adult WD	2	20
92	36	Kids WD	2	10
93	37	Adult WE	4	25
94	37	Kids WE	4	10
95	37	Adult WD	2	20
96	37	Kids WD	2	10
97	38	Adult WD	3	20
98	38	Adult WE	2	25
99	38	Kids WE	1	10
100	38	Kids WD	1	10
101	39	Adult WD	3	20
102	39	Adult WE	3	25
103	39	Kids WD	2	10
104	39	Kids WE	2	10
105	40	Adult WD	2	20
106	40	Adult WE	2	25
107	40	Kids WD	2	10
108	40	Kids WE	2	10
109	41	Adult WD	3	20
110	41	Adult WE	2	25
111	41	Kids WD	3	10
112	41	Kids WE	2	10
113	42	Adult WD	3	20
114	42	Adult WE	2	25
115	42	Kids WD	3	10
116	42	Kids WE	2	10
117	43	Adult WD	1	20
118	43	Adult WE	1	25
119	44	Adult WD	2	20
120	44	Adult WE	2	25
121	44	Kids WD	1	10
122	45	Adult WD	2	20
123	45	Adult WE	2	25
124	45	Kids WD	1	10
125	46	Adult WE	2	25
126	46	Adult WD	2	20
127	47	Adult WE	2	25
128	47	Kids WE	1	10
129	48	Adult WD	2	20
130	48	Adult WE	1	25
131	49	Adult WD	1	20
132	49	Adult WE	1	25
133	50	Adult WE	2	25
134	50	Kids WE	3	10
135	51	Adult WE	2	25
136	51	Adult WD	3	20
137	52	Adult WD	1	20
138	52	Adult WE	1	25
139	53	Adult WD	1	20
140	53	Adult WE	1	25
141	53	Kids WD	1	10
142	53	Kids WE	1	10
\.


--
-- Data for Name: User; Type: TABLE DATA; Schema: public; Owner: neondb_owner
--

COPY public."User" (id, username, "passwordHash", role, "permissionsJson", "isActive", "createdAt") FROM stdin;
1	JoB	$2b$10$mY0yn9NstZtftkq9zWWwAuBDwM2wggisNBSnQWg0IsSkHpYS4ImSq	ADMIN	{}	t	2026-03-11 08:36:30.915
2	FrontDesk	$2b$10$7cxYBlXes4kwZP1r5qSrTunK63pXkugQ5I42fCqSRvF2/p9tYQCOC	FRONT_DESK	{"canAccessPOS":true,"canConfirmOrder":true,"canNewCustomer":true,"canViewDailyReport":true,"canViewMonthlyReport":false,"canPrintReports":true,"canRefundInvoice":false}	t	2026-03-11 10:00:01.035
3	Georgia	$2b$10$cS46hCff6IFCTifoZ/TLR.q9bcrhtcbuWQhl3w0TFqdkWrTDKY54O	FRONT_DESK	{"canAccessPOS":true,"canConfirmOrder":true,"canNewCustomer":true,"canViewDailyReport":true,"canViewMonthlyReport":true,"canPrintReports":true,"canRefundInvoice":true}	t	2026-03-13 07:45:22.79
\.


--
-- Data for Name: _prisma_migrations; Type: TABLE DATA; Schema: public; Owner: neondb_owner
--

COPY public._prisma_migrations (id, checksum, finished_at, migration_name, logs, rolled_back_at, started_at, applied_steps_count) FROM stdin;
de479a15-0251-4f9e-94fa-455bf74d3d22	c252550bc070890332417fe22e9edc6b508bee6543b1bee458ce80626592c83a	2026-03-07 10:43:40.79824+00	20260307104339_init	\N	\N	2026-03-07 10:43:40.424299+00	1
\.


--
-- Data for Name: user_sessions; Type: TABLE DATA; Schema: public; Owner: neondb_owner
--

COPY public.user_sessions (sid, sess, expire) FROM stdin;
\.


--
-- Name: AuditLog_id_seq; Type: SEQUENCE SET; Schema: public; Owner: neondb_owner
--

SELECT pg_catalog.setval('public."AuditLog_id_seq"', 68, true);


--
-- Name: License_id_seq; Type: SEQUENCE SET; Schema: public; Owner: neondb_owner
--

SELECT pg_catalog.setval('public."License_id_seq"', 1, true);


--
-- Name: OrderItem_id_seq; Type: SEQUENCE SET; Schema: public; Owner: neondb_owner
--

SELECT pg_catalog.setval('public."OrderItem_id_seq"', 142, true);


--
-- Name: Order_id_seq; Type: SEQUENCE SET; Schema: public; Owner: neondb_owner
--

SELECT pg_catalog.setval('public."Order_id_seq"', 53, true);


--
-- Name: User_id_seq; Type: SEQUENCE SET; Schema: public; Owner: neondb_owner
--

SELECT pg_catalog.setval('public."User_id_seq"', 3, true);


--
-- Name: AuditLog AuditLog_pkey; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public."AuditLog"
    ADD CONSTRAINT "AuditLog_pkey" PRIMARY KEY (id);


--
-- Name: InvoiceCounter InvoiceCounter_pkey; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public."InvoiceCounter"
    ADD CONSTRAINT "InvoiceCounter_pkey" PRIMARY KEY (id);


--
-- Name: Item Item_pkey; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public."Item"
    ADD CONSTRAINT "Item_pkey" PRIMARY KEY (id);


--
-- Name: License License_pkey; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public."License"
    ADD CONSTRAINT "License_pkey" PRIMARY KEY (id);


--
-- Name: OrderItem OrderItem_pkey; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public."OrderItem"
    ADD CONSTRAINT "OrderItem_pkey" PRIMARY KEY (id);


--
-- Name: Order Order_pkey; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public."Order"
    ADD CONSTRAINT "Order_pkey" PRIMARY KEY (id);


--
-- Name: User User_pkey; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public."User"
    ADD CONSTRAINT "User_pkey" PRIMARY KEY (id);


--
-- Name: _prisma_migrations _prisma_migrations_pkey; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public._prisma_migrations
    ADD CONSTRAINT _prisma_migrations_pkey PRIMARY KEY (id);


--
-- Name: user_sessions session_pkey; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.user_sessions
    ADD CONSTRAINT session_pkey PRIMARY KEY (sid);


--
-- Name: AuditLog_createdAt_idx; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX "AuditLog_createdAt_idx" ON public."AuditLog" USING btree ("createdAt");


--
-- Name: IDX_session_expire; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX "IDX_session_expire" ON public.user_sessions USING btree (expire);


--
-- Name: License_key_key; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE UNIQUE INDEX "License_key_key" ON public."License" USING btree (key);


--
-- Name: Order_invoiceNumber_key; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE UNIQUE INDEX "Order_invoiceNumber_key" ON public."Order" USING btree ("invoiceNumber");


--
-- Name: User_username_key; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE UNIQUE INDEX "User_username_key" ON public."User" USING btree (username);


--
-- Name: OrderItem OrderItem_orderId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public."OrderItem"
    ADD CONSTRAINT "OrderItem_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES public."Order"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: Order Order_createdById_fkey; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public."Order"
    ADD CONSTRAINT "Order_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES public."User"(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: DEFAULT PRIVILEGES FOR SEQUENCES; Type: DEFAULT ACL; Schema: public; Owner: cloud_admin
--

ALTER DEFAULT PRIVILEGES FOR ROLE cloud_admin IN SCHEMA public GRANT ALL ON SEQUENCES TO neon_superuser WITH GRANT OPTION;


--
-- Name: DEFAULT PRIVILEGES FOR TABLES; Type: DEFAULT ACL; Schema: public; Owner: cloud_admin
--

ALTER DEFAULT PRIVILEGES FOR ROLE cloud_admin IN SCHEMA public GRANT ALL ON TABLES TO neon_superuser WITH GRANT OPTION;


--
-- PostgreSQL database dump complete
--

\unrestrict abqqRG8ni4SYAii0IOqspZLCJwiD5VUj0a1Q334xjyaghrefzUakbb0bUEhb4dW

