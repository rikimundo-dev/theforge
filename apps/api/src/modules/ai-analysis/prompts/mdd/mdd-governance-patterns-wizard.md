## [ARQUITECTURA - SECCIÓN INMUTABLE] CONFIGURACIÓN DE PATRONES DE DESARROLLO

> ### 🚨 NOTA DE SISTEMA PARA AGENTES DE IA (PROHIBIDO ELIMINAR O MODIFICAR)
> Esta sección contiene las decisiones de diseño arquitectónico globales del proyecto. 
> ANTES de generar cualquier documento posterior (Spec, Arq, API, Flujos, Tasks, Infra), DEBES leer obligatoriamente las opciones marcadas con [X] en este Wizard. Toda especificación, contrato, diagrama o tarea técnica generada debe alinearse estrictamente con los patrones activados.

### 🧙‍♂️ WIZARD DE SELECCIÓN DE PATRONES COMPLETO
*Instrucciones para el usuario: Marca con una [X] todos los patrones que aplicarán a este desarrollo.*

#### 🏛️ 1. PATRONES DE ARQUITECTURA GLOBAL Y DISTRIBUIDA
- [ ] **Arquitectura Hexagonal (Ports & Adapters):** Aísla la lógica de negocio central de agentes externos, bases de datos o frameworks mediante interfaces. *(Afecta a: Arq, MDD, Flujos, Tasks)*
- [ ] **Clean Architecture / Onion Architecture:** Estructura el software en capas concéntricas donde la dependencia va estrictamente hacia el centro (entidades de negocio). *(Afecta a: Arq, MDD, Tasks)*
- [ ] **Microservicios:** Divide el sistema en servicios autónomos, débilmente acoplados y desplegables de forma independiente. *(Afecta a: Arq, API, Infra, Tasks)*
- [ ] **Monolito Modular:** Mantiene una única unidad de despliegue pero con una separación estricta y lógica de módulos de negocio independientes. *(Afecta a: Arq, MDD)*
- [ ] **CQRS (Command Query Responsibility Segregation):** Separa los modelos y caminos de ejecución para operaciones de lectura y de escritura. *(Afecta a: Arq, API, Flujos, Tasks)*
- [ ] **Event-Driven Architecture (EDA):** Arquitectura basada en la producción, detección y consumo de eventos asíncronos. *(Afecta a: Arq, Flujos, Infra)*
- [ ] **SOA (Service-Oriented Architecture):** Estructura orientada a servicios que se comunican mediante un protocolo de enlace común (como ESB). *(Afecta a: Arq, API)*
- [ ] **Serverless Architecture:** Aplicaciones que dependen de servicios de terceros (BaaS) o contenedores efímeros (FaaS) gestionados por la nube. *(Afecta a: Arq, Infra, Tasks)*

#### 🏗️ 2. PATRONES DE DISEÑO: CREACIONALES (Gof)
- [ ] **Abstract Factory:** Proporciona una interfaz para crear familias de objetos relacionados o dependientes sin especificar sus clases concretas. *(Afecta a: MDD, Tasks)*
- [ ] **Builder:** Separa la construcción de un objeto complejo de su representación, permitiendo crear diferentes representaciones. *(Afecta a: MDD, Tasks)*
- [ ] **Factory Method:** Define una interfaz para crear un objeto, pero deja que las subclases decidan qué clase instanciar. *(Afecta a: MDD, Tasks)*
- [ ] **Prototype:** Permite copiar objetos existentes sin que el código dependa de sus clases concretas. *(Afecta a: MDD, Tasks)*
- [ ] **Singleton:** Garantiza que una clase tenga una única instancia en toda la aplicación y proporciona un acceso global a ella. *(Afecta a: MDD, Tasks)*

#### 🔌 3. PATRONES DE DISEÑO: ESTRUCTURALES (GoF)
- [ ] **Adapter:** Permite que interfaces incompatibles trabajen juntas, traduciendo las peticiones de un cliente a un formato comprensible. *(Afecta a: API, Flujos, Tasks)*
- [ ] **Bridge:** Desacopla una abstracción de su implementación, de modo que ambas puedan variar de forma independiente. *(Afecta a: MDD, Tasks)*
- [ ] **Composite:** Permite componer objetos en estructuras de árbol para representar jerarquías de parte-todo. *(Afecta a: MDD, Design System, Tasks)*
- [ ] **Decorator:** Añade responsabilidades a un objeto dinámicamente de forma transparente sin modificar su estructura base. *(Afecta a: MDD, Tasks)*
- [ ] **Facade (Fachada):** Proporciona una interfaz unificada y simplificada para un conjunto de interfaces en un subsistema complejo. *(Afecta a: API, MDD, Tasks)*
- [ ] **Flyweight (Peso Ligero):** Minimiza el uso de memoria compartiendo la mayor cantidad posible de datos con objetos similares. *(Afecta a: MDD, Tasks)*
- [ ] **Proxy:** Proporciona un sustituto o marcador de posición para otro objeto para controlar el acceso, interceptar llamadas o diferir costos. *(Afecta a: MDD, Tasks)*

#### 🧠 4. PATRONES DE DISEÑO: COMPORTAMIENTO (GoF)
- [ ] **Chain of Responsibility:** Permite pasar peticiones a lo largo de una cadena de manejadores; cada uno decide si procesa la petición o la pasa al siguiente. *(Afecta a: Flujos, Tasks)*
- [ ] **Command:** Encapsula una petición como un objeto, permitiendo parametrizar a los clientes con diferentes peticiones, hacer colas y operaciones reversibles. *(Afecta a: MDD, Flujos, Tasks)*
- [ ] **Interpreter:** Dada un lenguaje, define una representación para su gramática junto con un intérprete que la utiliza. *(Afecta a: Spec, MDD)*
- [ ] **Iterator:** Permite recorrer secuencialmente los elementos de una colección sin exponer su representación subyacente. *(Afecta a: MDD, Tasks)*
- [ ] **Mediator:** Define un objeto que encapsula cómo interactúa un conjunto de objetos, promoviendo un acoplamiento débil. *(Afecta a: MDD, Flujos, Tasks)*
- [ ] **Memento:** Permite capturar y externalizar el estado interno de un objeto para poder restaurarlo más tarde sin violar la encapsulación. *(Afecta a: Flujos, Tasks)*
- [ ] **Observer / Pub-Sub:** Establece una relación de dependencia de uno a muchos para que los cambios en un objeto notifiquen automáticamente a los demás. *(Afecta a: Flujos, Tasks)*
- [ ] **State:** Permite que un objeto modifique su comportamiento cada vez que cambia su estado interno, pareciendo cambiar de clase. *(Afecta a: Spec, Casos, Flujos, Tasks)*
- [ ] **Strategy:** Define una familia de algoritmos, encapsula cada uno y los hace intercambiables dinámicamente en tiempo de ejecución. *(Afecta a: Spec, MDD, Tasks)*
- [ ] **Template Method:** Define el esqueleto de un algoritmo en una operación, delegando algunos pasos a las subclases sin cambiar la estructura general. *(Afecta a: MDD, Tasks)*
- [ ] **Visitor:** Permite definir una nueva operación sobre una estructura de objetos sin cambiar las clases de los elementos sobre los que opera. *(Afecta a: MDD, Tasks)*

#### 💾 5. PATRONES DE PERSISTENCIA Y MANEJO DE DATOS
- [ ] **Repository:** Media entre el dominio y las capas de mapeo de datos mediante una interfaz de estilo colección abstracta. *(Afecta a: MDD, Tasks)*
- [ ] **Data Mapper:** Capa de mapeo que aísla los objetos de dominio de la base de datos, manteniendo la independencia del modelo. *(Afecta a: MDD, Tasks)*
- [ ] **Active Record:** Objeto que envuelve una fila de una tabla de base de datos, encapsula el acceso a los datos e incluye lógica de negocio asociada. *(Afecta a: MDD, Tasks)*
- [ ] **Unit of Work:** Mantiene una lista de objetos afectados por una transacción de negocio y coordina la escritura de los cambios. *(Afecta a: MDD, Flujos)*

#### 🛡️ 6. PATRONES DE INTEGRACIÓN, GESTIÓN DE APIs Y RESILIENCIA
- [ ] **API Gateway:** Único punto de entrada para todas las solicitudes de clientes, encargado de enrutar, agregar y autenticar. *(Afecta a: API, Arq, Infra)*
- [ ] **BFF (Backend For Frontend):** Crea variantes de backend específicas para optimizar el rendimiento y datos de interfaces web, móviles o IoT diferenciadas. *(Afecta a: Blueprint, Arq, API)*
- [ ] **Saga (Transacciones Distribuidas):** Gestiona la consistencia de datos entre microservicios mediante una secuencia de transacciones locales y acciones de compensación. *(Afecta a: Flujos, Tasks)*
- [ ] **Circuit Breaker:** Monitorea fallos en servicios externos y bloquea peticiones de forma temporal para evitar caídas en cascada. *(Afecta a: Arq, Tasks, Infra)*
- [ ] **Outbox Pattern:** Garantiza la publicación confiable de eventos asíncronos guardándolos primero en la base de datos local antes de enviarlos al Message Broker. *(Afecta a: Flujos, Tasks)*
- [ ] **Event Sourcing:** Almacena el estado de una entidad como una secuencia cronológica de eventos inmutables en lugar del estado actual puro. *(Afecta a: Arq, Flujos, Infra)*
- [ ] **Strangler Fig (Estrangulamiento):** Migra incrementalmente un sistema legado reemplazando características antiguas de forma gradual con nuevos servicios. *(Afecta a: Arq, Tasks)*

---
